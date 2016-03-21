#include "engine/guidance/post_processing.hpp"
#include "extractor/guidance/turn_instruction.hpp"

#include "engine/guidance/toolkit.hpp"

#include <boost/assert.hpp>
#include <iostream>
#include <vector>

using TurnInstruction = osrm::extractor::guidance::TurnInstruction;
using TurnType = osrm::extractor::guidance::TurnType;
using DirectionModifier = osrm::extractor::guidance::DirectionModifier;

namespace osrm
{
namespace engine
{
namespace guidance
{

namespace detail
{
bool canMergeTrivially(const RouteStep &destination, const RouteStep &source)
{
    return destination.maneuver.exit == 0 && destination.name_id == source.name_id &&
           isSilent(source.maneuver.instruction);
}

RouteStep forwardInto(RouteStep destination, const RouteStep &source)
{
    // Merge a turn into a silent turn
    // Overwrites turn instruction and increases exit NR
    destination.maneuver.exit = source.maneuver.exit;
    return destination;
}

RouteStep accumulateInto(RouteStep destination, const RouteStep &source)
{
    // Merge a turn into a silent turn
    // Overwrites turn instruction and increases exit NR
    BOOST_ASSERT(canMergeTrivially(destination, source));
    destination.maneuver.exit = source.maneuver.exit + 1;
    return destination;
}

RouteStep mergeInto(RouteStep destination, const RouteStep &source)
{
    if (source.maneuver.instruction == TurnInstruction::NO_TURN())
    {
        BOOST_ASSERT(canMergeTrivially(destination, source));
        return detail::forwardInto(destination, source);
    }
    if (source.maneuver.instruction.type == TurnType::Suppressed)
    {
        return detail::forwardInto(destination, source);
    }
    if (source.maneuver.instruction.type == TurnType::StayOnRoundabout)
    {
        return detail::forwardInto(destination, source);
    }
    if (entersRoundabout(source.maneuver.instruction))
    {
        return detail::forwardInto(destination, source);
    }
    return destination;
}

} // namespace detail

void print(const std::vector<RouteStep> &steps)
{
    std::cout << "Path\n";
    int segment = 0;
    for (const auto &step : steps)
    {
        const auto type = static_cast<int>(step.maneuver.instruction.type);
        const auto modifier = static_cast<int>(step.maneuver.instruction.direction_modifier);

        std::cout << "\t[" << ++segment << "]: " << type << " " << modifier << " name["
                  << step.name_id << "]: " << step.name << " Duration: " << step.duration
                  << " Distance: " << step.distance << " Geometry" << step.geometry_begin << " "
                  << step.geometry_end << " exit: " << step.maneuver.exit << "\n";
    }
}

std::vector<RouteStep> postProcess(std::vector<RouteStep> steps)
{
    // the steps should always include the first/last step in form of a location
    BOOST_ASSERT(steps.size() >= 2);
    if (steps.size() == 2)
        return steps;

#define PRINT_DEBUG 1
    unsigned carry_exit = 0;
#if PRINT_DEBUG
    std::cout << "[POSTPROCESSING ITERATION]" << std::endl;
    std::cout << "Input\n";
    print(steps);
#endif
    // Count Street Exits forward
    bool on_roundabout = false;

    for (std::size_t data_index = 0; data_index + 1 < steps.size(); ++data_index)
    {
        if (entersRoundabout(steps[data_index].maneuver.instruction))
        {
            steps[data_index].maneuver.exit += 1;
            on_roundabout = true;
        }

        if (isSilent(steps[data_index].maneuver.instruction) &&
            steps[data_index].maneuver.instruction != TurnInstruction::NO_TURN())
        {
            steps[data_index].maneuver.exit += 1;
        }
        if (leavesRoundabout(steps[data_index].maneuver.instruction))
        {
            if (!on_roundabout)
            {
                //the initial instruction needs to be an enter roundabout, if its the first one
                BOOST_ASSERT(steps[0].maneuver.instruction.type == TurnInstruction::NO_TURN());
                if (steps[data_index].maneuver.instruction.type == TurnType::ExitRoundabout)
                    steps[0].maneuver.instruction.type = TurnType::EnterRoundabout;
                if (steps[data_index].maneuver.instruction.type == TurnType::ExitRotary)
                    steps[0].maneuver.instruction.type = TurnType::EnterRotary;
                steps[data_index].maneuver.exit += 1;
            }
            on_roundabout = false;
        }
        if (steps[data_index].maneuver.instruction.type == TurnType::EnterRoundaboutAtExit)
        {
            steps[data_index].maneuver.exit += 1;
            steps[data_index].maneuver.instruction.type = TurnType::EnterRoundabout;
        }
        else if (steps[data_index].maneuver.instruction.type == TurnType::EnterRotaryAtExit)
        {
            steps[data_index].maneuver.exit += 1;
            steps[data_index].maneuver.instruction.type = TurnType::EnterRotary;
        }

        if (isSilent(steps[data_index].maneuver.instruction) ||
            entersRoundabout(steps[data_index].maneuver.instruction))
        {
            steps[data_index + 1] =
                detail::mergeInto(steps[data_index + 1], steps[data_index]);
        }
        carry_exit = steps[data_index].maneuver.exit;
    }
#if PRINT_DEBUG
    std::cout << "Merged\n";
    print(steps);
#endif
#if 0
    on_roundabout = false;
    // Move Roundabout exit numbers to front
    for (auto rev_itr = leg_data.rbegin(); rev_itr != leg_data.rend(); ++rev_itr)
    {
        auto &path_data = *rev_itr;
        for (std::size_t data_index = path_data.size(); data_index > 1; --data_index)
        {
            if (entersRoundabout(path_data[data_index - 1].maneuver.instruction))
            {
                if (!on_roundabout && !leavesRoundabout(path_data[data_index - 1].maneuver.instruction))
                    path_data[data_index - 1].exit = 0;
                on_roundabout = false;
            }
            if (on_roundabout)
            {
                path_data[data_index - 2].exit = path_data[data_index - 1].exit;
            }
            if (leavesRoundabout(path_data[data_index - 1].maneuver.instruction) &&
                !entersRoundabout(path_data[data_index - 1].maneuver.instruction))
            {
                path_data[data_index - 2].exit = path_data[data_index - 1].exit;
                on_roundabout = true;
            }
        }
        auto prev_leg = std::next(rev_itr);
        if (!path_data.empty() && prev_leg != leg_data.rend())
        {
            if (on_roundabout && path_data[0].exit)
                prev_leg->back().exit = path_data[0].exit;
        }
    }
#endif

    //TODO remove silent turns
    return steps;
}

} // namespace guidance
} // namespace engine
} // namespace osrm
