#include "engine/plugins/plugin_base.hpp"
#include "engine/plugins/tile.hpp"

#include "util/coordinate_calculation.hpp"

#include <protozero/varint.hpp>
#include <protozero/pbf_writer.hpp>

#include <string>
#include <vector>
#include <utility>

#include <cmath>
#include <cstdint>

namespace osrm
{
namespace engine
{
namespace plugins
{
namespace detail
{
// Vector tiles are 4096 virtual pixels on each side
const constexpr double VECTOR_TILE_EXTENT = 4096.0;

// Simple container class for WSG84 coordinates
template <typename T> struct Point final
{
    Point(T _x, T _y) : x(_x), y(_y) {}

    const T x;
    const T y;
};

// from mapnik-vector-tile
namespace pbf
{
inline unsigned encode_length(const unsigned len) { return (len << 3u) | 2u; }
}

struct BBox final
{
    BBox(const double _minx, const double _miny, const double _maxx, const double _maxy)
        : minx(_minx), miny(_miny), maxx(_maxx), maxy(_maxy)
    {
    }

    double width() const { return maxx - minx; }
    double height() const { return maxy - miny; }

    const double minx;
    const double miny;
    const double maxx;
    const double maxy;
};

// Simple container for integer coordinates (i.e. pixel coords)
struct point_type_i final
{
    point_type_i(std::int64_t _x, std::int64_t _y) : x(_x), y(_y) {}

    const std::int64_t x;
    const std::int64_t y;
};

using FixedLine = std::vector<detail::Point<std::int32_t>>;
using FloatLine = std::vector<detail::Point<double>>;

// from mapnik-vector-tile
// Encodes a linestring using protobuf zigzag encoding
inline bool encodeLinestring(const FixedLine &line,
                             protozero::packed_field_uint32 &geometry,
                             std::int32_t &start_x,
                             std::int32_t &start_y)
{
    const std::size_t line_size = line.size();
    if (line_size < 2)
    {
        return false;
    }

    const unsigned line_to_length = static_cast<const unsigned>(line_size) - 1;

    auto pt = line.begin();
    geometry.add_element(9); // move_to | (1 << 3)
    geometry.add_element(protozero::encode_zigzag32(pt->x - start_x));
    geometry.add_element(protozero::encode_zigzag32(pt->y - start_y));
    start_x = pt->x;
    start_y = pt->y;
    geometry.add_element(detail::pbf::encode_length(line_to_length));
    for (++pt; pt != line.end(); ++pt)
    {
        const std::int32_t dx = pt->x - start_x;
        const std::int32_t dy = pt->y - start_y;
        geometry.add_element(protozero::encode_zigzag32(dx));
        geometry.add_element(protozero::encode_zigzag32(dy));
        start_x = pt->x;
        start_y = pt->y;
    }
    return true;
}

FixedLine coordinatesToTileLine(const util::Coordinate start,
                                const util::Coordinate target,
                                const detail::BBox &tile_bbox)
{
    using namespace util::coordinate_calculation;
    FloatLine geo_line;
    geo_line.emplace_back(static_cast<double>(util::toFloating(start.lon)),
                          static_cast<double>(util::toFloating(start.lat)));
    geo_line.emplace_back(static_cast<double>(util::toFloating(target.lon)),
                          static_cast<double>(util::toFloating(target.lat)));
    FixedLine tile_line;
    for (auto const &pt : geo_line)
    {
        double px_merc = pt.x * mercator::DEGREE_TO_PX;
        double py_merc = mercator::latToY(util::FloatLatitude(pt.y)) * mercator::DEGREE_TO_PX;
        // convert lon/lat to tile coordinates
        const auto px = std::round(
            ((px_merc - tile_bbox.minx) * mercator::TILE_SIZE / tile_bbox.width()) *
            detail::VECTOR_TILE_EXTENT / util::coordinate_calculation::mercator::TILE_SIZE);
        const auto py = std::round(
            ((tile_bbox.maxy - py_merc) * mercator::TILE_SIZE / tile_bbox.height()) *
            detail::VECTOR_TILE_EXTENT / util::coordinate_calculation::mercator::TILE_SIZE);
        tile_line.emplace_back(px, py);
    }
    return tile_line;
}
}

Status TilePlugin::HandleRequest(const api::TileParameters &parameters, std::string &pbf_buffer)
{
    BOOST_ASSERT(parameters.IsValid());

    using namespace util::coordinate_calculation;
    double min_lon, min_lat, max_lon, max_lat;

    // Convert the z,x,y mercator tile coordinates into WSG84 lon/lat values
    mercator::xyzToWSG84(parameters.x, parameters.y, parameters.z, min_lon, min_lat, max_lon,
                         max_lat);

    util::Coordinate southwest{util::FloatLongitude(min_lon), util::FloatLatitude(min_lat)};
    util::Coordinate northeast{util::FloatLongitude(max_lon), util::FloatLatitude(max_lat)};

    // Fetch all the segments that are in our bounding box.
    // This hits the OSRM StaticRTree
    const auto edges = facade.GetEdgesInBox(southwest, northeast);

    std::vector<int> used_weights;
    std::unordered_map<int, std::size_t> weight_offsets;
    uint8_t max_datasource_id = 0;

    // Loop over all edges once to tally up all the attributes we'll need.
    // We need to do this so that we know the attribute offsets to use
    // when we encode each feature in the tile.
    for (const auto &edge : edges)
    {
        int forward_weight = 0, reverse_weight = 0;
        uint8_t forward_datasource = 0;
        uint8_t reverse_datasource = 0;

        if (edge.forward_packed_geometry_id != SPECIAL_EDGEID)
        {
            std::vector<EdgeWeight> forward_weight_vector;
            facade.GetUncompressedWeights(edge.forward_packed_geometry_id, forward_weight_vector);
            forward_weight = forward_weight_vector[edge.fwd_segment_position];

            std::vector<uint8_t> forward_datasource_vector;
            facade.GetUncompressedDatasources(edge.forward_packed_geometry_id,
                                              forward_datasource_vector);
            forward_datasource = forward_datasource_vector[edge.fwd_segment_position];

            if (weight_offsets.find(forward_weight) == weight_offsets.end())
            {
                used_weights.push_back(forward_weight);
                weight_offsets[forward_weight] = used_weights.size() - 1;
            }
        }

        if (edge.reverse_packed_geometry_id != SPECIAL_EDGEID)
        {
            std::vector<EdgeWeight> reverse_weight_vector;
            facade.GetUncompressedWeights(edge.reverse_packed_geometry_id, reverse_weight_vector);

            BOOST_ASSERT(edge.fwd_segment_position < reverse_weight_vector.size());

            reverse_weight =
                reverse_weight_vector[reverse_weight_vector.size() - edge.fwd_segment_position - 1];

            if (weight_offsets.find(reverse_weight) == weight_offsets.end())
            {
                used_weights.push_back(reverse_weight);
                weight_offsets[reverse_weight] = used_weights.size() - 1;
            }
            std::vector<uint8_t> reverse_datasource_vector;
            facade.GetUncompressedDatasources(edge.reverse_packed_geometry_id,
                                              reverse_datasource_vector);
            reverse_datasource = reverse_datasource_vector[reverse_datasource_vector.size() -
                                                           edge.fwd_segment_position - 1];
        }
        // Keep track of the highest datasource seen so that we don't write unnecessary
        // data to the layer attribute values
        max_datasource_id = std::max(max_datasource_id, forward_datasource);
        max_datasource_id = std::max(max_datasource_id, reverse_datasource);
    }

    // TODO: extract speed values for compressed and uncompressed geometries

    // Convert tile coordinates into mercator coordinates
    mercator::xyzToMercator(parameters.x, parameters.y, parameters.z, min_lon, min_lat, max_lon,
                            max_lat);
    const detail::BBox tile_bbox{min_lon, min_lat, max_lon, max_lat};

    // Protobuf serialized blocks when objects go out of scope, hence
    // the extra scoping below.
    protozero::pbf_writer tile_writer{pbf_buffer};
    {
        // Add a layer object to the PBF stream.  3=='layer' from the vector tile spec (2.1)
        protozero::pbf_writer layer_writer(tile_writer, 3);
        // TODO: don't write a layer if there are no features

        layer_writer.add_uint32(15, 2); // version
        // Field 1 is the "layer name" field, it's a string
        layer_writer.add_string(1, "speeds"); // name
        // Field 5 is the tile extent.  It's a uint32 and should be set to 4096
        // for normal vector tiles.
        layer_writer.add_uint32(5, 4096); // extent

        // Begin the layer features block
        {
            // Each feature gets a unique id, starting at 1
            unsigned id = 1;
            for (const auto &edge : edges)
            {
                // Get coordinates for start/end nodes of segmet (NodeIDs u and v)
                const auto a = facade.GetCoordinateOfNode(edge.u);
                const auto b = facade.GetCoordinateOfNode(edge.v);
                // Calculate the length in meters
                const double length = osrm::util::coordinate_calculation::haversineDistance(a, b);

                int forward_weight = 0;
                int reverse_weight = 0;

                uint8_t forward_datasource = 0;
                uint8_t reverse_datasource = 0;

                if (edge.forward_packed_geometry_id != SPECIAL_EDGEID)
                {
                    std::vector<EdgeWeight> forward_weight_vector;
                    facade.GetUncompressedWeights(edge.forward_packed_geometry_id,
                                                  forward_weight_vector);
                    forward_weight = forward_weight_vector[edge.fwd_segment_position];

                    std::vector<uint8_t> forward_datasource_vector;
                    facade.GetUncompressedDatasources(edge.forward_packed_geometry_id,
                                                      forward_datasource_vector);
                    forward_datasource = forward_datasource_vector[edge.fwd_segment_position];
                }

                if (edge.reverse_packed_geometry_id != SPECIAL_EDGEID)
                {
                    std::vector<EdgeWeight> reverse_weight_vector;
                    facade.GetUncompressedWeights(edge.reverse_packed_geometry_id,
                                                  reverse_weight_vector);

                    BOOST_ASSERT(edge.fwd_segment_position < reverse_weight_vector.size());

                    reverse_weight = reverse_weight_vector[reverse_weight_vector.size() -
                                                           edge.fwd_segment_position - 1];

                    std::vector<uint8_t> reverse_datasource_vector;
                    facade.GetUncompressedDatasources(edge.reverse_packed_geometry_id,
                                                      reverse_datasource_vector);
                    reverse_datasource =
                        reverse_datasource_vector[reverse_datasource_vector.size() -
                                                  edge.fwd_segment_position - 1];
                }

                // Keep track of the highest datasource seen so that we don't write unnecessary
                // data to the layer attribute values
                max_datasource_id = std::max(max_datasource_id, forward_datasource);
                max_datasource_id = std::max(max_datasource_id, reverse_datasource);

                const auto encode_tile_line = [&layer_writer, &edge, &id, &max_datasource_id](
                    const detail::FixedLine &tile_line, const std::uint32_t speed_kmh,
                    const std::size_t duration, const std::uint8_t datasource,
                    std::int32_t &start_x, std::int32_t &start_y)
                {
                    // Here, we save the two attributes for our feature: the speed and the
                    // is_small
                    // boolean.  We onl serve up speeds from 0-139, so all we do is save the
                    // first
                    protozero::pbf_writer feature_writer(layer_writer, 2);
                    // Field 3 is the "geometry type" field.  Value 2 is "line"
                    feature_writer.add_enum(3, 2); // geometry type
                    // Field 1 for the feature is the "id" field.
                    feature_writer.add_uint64(1, id++); // id
                    {
                        // When adding attributes to a feature, we have to write
                        // pairs of numbers.  The first value is the index in the
                        // keys array (written later), and the second value is the
                        // index into the "values" array (also written later).  We're
                        // not writing the actual speed or bool value here, we're saving
                        // an index into the "values" array.  This means many features
                        // can share the same value data, leading to smaller tiles.
                        protozero::packed_field_uint32 field(feature_writer, 2);

                        field.add_element(0); // "speed" tag key offset
                        field.add_element(
                            std::min(speed_kmh, 127u)); // save the speed value, capped at 127
                        field.add_element(1);           // "is_small" tag key offset
                        field.add_element(128 +
                                          (edge.component.is_tiny ? 0 : 1)); // is_small feature
                        field.add_element(2);                // "datasource" tag key offset
                        field.add_element(130 + datasource); // datasource value offset
                        field.add_element(3);                // "duration" tag key offset
                        field.add_element(130 + max_datasource_id + 1 +
                                          duration); // duration value offset
                    }
                    {
                        // Encode the geometry for the feature
                        protozero::packed_field_uint32 geometry(feature_writer, 4);
                        encodeLinestring(tile_line, geometry, start_x, start_y);
                    }
                };

                // If this is a valid forward edge, go ahead and add it to the tile
                if (forward_weight != 0 && edge.forward_edge_based_node_id != SPECIAL_NODEID)
                {
                    std::int32_t start_x = 0;
                    std::int32_t start_y = 0;

                    // Calculate the speed for this line
                    std::uint32_t speed_kmh =
                        static_cast<std::uint32_t>(round(length / forward_weight * 10 * 3.6));

                    auto tile_line = coordinatesToTileLine(a, b, tile_bbox);
                    encode_tile_line(tile_line, speed_kmh, weight_offsets[forward_weight],
                                     forward_datasource, start_x, start_y);
                }

                // Repeat the above for the coordinates reversed and using the `reverse`
                // properties
                if (reverse_weight != 0 && edge.reverse_edge_based_node_id != SPECIAL_NODEID)
                {
                    std::int32_t start_x = 0;
                    std::int32_t start_y = 0;

                    // Calculate the speed for this line
                    std::uint32_t speed_kmh =
                        static_cast<std::uint32_t>(round(length / reverse_weight * 10 * 3.6));

                    auto tile_line = coordinatesToTileLine(b, a, tile_bbox);
                    encode_tile_line(tile_line, speed_kmh, weight_offsets[reverse_weight],
                                     reverse_datasource, start_x, start_y);
                }
            }
        }

        // Field id 3 is the "keys" attribute
        // We need two "key" fields, these are referred to with 0 and 1 (their array indexes)
        // earlier
        layer_writer.add_string(3, "speed");
        layer_writer.add_string(3, "is_small");
        layer_writer.add_string(3, "datasource");
        layer_writer.add_string(3, "duration");

        // Now, we write out the possible speed value arrays and possible is_tiny
        // values.  Field type 4 is the "values" field.  It's a variable type field,
        // so requires a two-step write (create the field, then write its value)
        for (std::size_t i = 0; i < 128; i++)
        {
            // Writing field type 4 == variant type
            protozero::pbf_writer values_writer(layer_writer, 4);
            // Attribute value 5 == uin64 type
            values_writer.add_uint64(5, i);
        }
        {
            protozero::pbf_writer values_writer(layer_writer, 4);
            // Attribute value 7 == bool type
            values_writer.add_bool(7, true);
        }
        {
            protozero::pbf_writer values_writer(layer_writer, 4);
            // Attribute value 7 == bool type
            values_writer.add_bool(7, false);
        }
        for (std::size_t i = 0; i <= max_datasource_id; i++)
        {
            // Writing field type 4 == variant type
            protozero::pbf_writer values_writer(layer_writer, 4);
            // Attribute value 1 == string type
            values_writer.add_string(1, facade.GetDatasourceName(i));
        }
        for (auto weight : used_weights)
        {
            // Writing field type 4 == variant type
            protozero::pbf_writer values_writer(layer_writer, 4);
            // Attribute value 2 == float type
            // Durations come out of OSRM in integer deciseconds, so we convert them
            // to seconds with a simple /10 for display
            values_writer.add_double(3, weight / 10.);
        }
    }

    return Status::Ok;
}
}
}
}
