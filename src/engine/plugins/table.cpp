#include "engine/plugins/table.hpp"

#include "engine/api/table_parameters.hpp"
#include "engine/api/table_api.hpp"
#include "engine/routing_algorithms/many_to_many.hpp"
#include "engine/search_engine_data.hpp"
#include "util/string_util.hpp"
#include "util/json_container.hpp"

#include <cstdlib>

#include <algorithm>
#include <memory>
#include <string>
#include <vector>

#include <boost/assert.hpp>

namespace osrm
{
namespace engine
{
namespace plugins
{

TablePlugin::TablePlugin(datafacade::BaseDataFacade &facade, const int max_locations_distance_table)
    : BasePlugin{facade}, distance_table(&facade, heaps),
      max_locations_distance_table(max_locations_distance_table)
{
}

Status TablePlugin::HandleRequest(const api::TableParameters &params, util::json::Object &result)
{
    BOOST_ASSERT(params.IsValid());

    if (!CheckAllCoordinates(params.coordinates))
    {
        return Error("InvalidOptions", "Coordinates are invalid", result);
    }

    if (params.bearings.size() > 0 && params.coordinates.size() != params.bearings.size())
    {
        return Error("InvalidOptions", "Number of bearings does not match number of coordinates",
                     result);
    }

    if (max_locations_distance_table > 0 &&
        (params.sources.size() * params.destinations.size() >
         static_cast<std::size_t>(max_locations_distance_table * max_locations_distance_table)))
    {
        return Error(
            "InvalidOptions",
            "Number of entries " +
                std::to_string(params.sources.size() * params.destinations.size()) +
                " is higher than current maximum (" +
                std::to_string(max_locations_distance_table * max_locations_distance_table) + ")",
            result);
    }

    auto snapped_phantoms = SnapPhantomNodes(GetPhantomNodes(params));
    auto result_table = distance_table(snapped_phantoms, params.sources, params.destinations);

    if (result_table.empty())
    {
        return Error("NoTable", "No table found", result);
    }

    api::TableAPI table_api{facade, params};
    table_api.MakeResponse(result_table, snapped_phantoms, result);

    return Status::Ok;
}
}
}
}
