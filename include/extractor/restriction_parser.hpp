#ifndef RESTRICTION_PARSER_HPP
#define RESTRICTION_PARSER_HPP

#include "graph/turn_restriction.hpp"

#include <boost/optional/optional.hpp>

#include <string>
#include <vector>

struct lua_State;
namespace osmium
{
class Relation;
}

namespace osrm
{
namespace extractor
{

/**
 * Parses the relations that represents turn restrictions.
 *
 * Currently only restrictions where the via objects is a node are supported.
 *  from   via   to
 * ------->(x)-------->
 *
 * While this class does not directly invoke any lua code _per relation_ it does
 * load configuration values from the profile, that are saved in variables.
 * Namely ```use_turn_restrictions``` and ```get_exceptions```.
 *
 * The restriction is represented by the osm id of the from way, the osm id of the
 * to way and the osm id of the via node. This representation must be post-processed
 * in the extractor to work with the edge-based data-model of OSRM:
 * Since the from and to way share the via-node a turn will have the following form:
 * ...----(a)-----(via)------(b)----...
 * So it can be represented by the tripe (a, via, b).
 */
class RestrictionParser
{
  public:
    RestrictionParser(lua_State *lua_state);
    boost::optional<graph::InputRestrictionContainer> TryParse(const osmium::Relation &relation) const;

  private:
    void ReadUseRestrictionsSetting(lua_State *lua_state);
    void ReadRestrictionExceptions(lua_State *lua_state);
    bool ShouldIgnoreRestriction(const std::string &except_tag_string) const;

    std::vector<std::string> restriction_exceptions;
    bool use_turn_restrictions;
};
}
}

#endif /* RESTRICTION_PARSER_HPP */
