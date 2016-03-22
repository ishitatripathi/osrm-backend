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

        std::cout << "\t[" << ++segment << "]: " << type << " " << modifier
                  << " Duration: " << step.duration << " Distance: " << step.distance
                  << " Geometry: " << step.geometry_begin << " " << step.geometry_end
                  << " exit: " << step.maneuver.exit << " name[" << step.name_id
                  << "]: " << step.name << std::endl;
    }
}

// Every Step Maneuver consists of the information until the turn.
// This list contains a set of instructions, called silent, which should
// not be part of the final output.
// They are required for maintenance purposes. We can calculate the number
// of exits to pass in a roundabout and the number of intersections
// that we come across.
std::vector<RouteStep> postProcess(std::vector<RouteStep> steps)
{
    // the steps should always include the first/last step in form of a location
    BOOST_ASSERT(steps.size() >= 2);
    if (steps.size() == 2)
        return steps;

#define PRINT_DEBUG 1
#if PRINT_DEBUG
    std::cout << "[POSTPROCESSING ITERATION]" << std::endl;
    std::cout << "Input\n";
    print(steps);
#endif
    // Count Street Exits forward
    bool on_roundabout = false;

    // count the exits forward. if enter/exit roundabout happen both, no further treatment is
    // required. We might end up with only one of them (e.g. starting within a roundabout)
    // or having a via-point in the roundabout.
    // In this case, exits are numbered from the start of the lag.
    for (std::size_t step_index = 0; step_index < steps.size(); ++step_index)
    {
        auto &step = steps[step_index];
        const auto instruction = step.maneuver.instruction;
        if (entersRoundabout(step.maneuver.instruction))
        {
            // basic entry into a roundabout
            step.maneuver.exit = 1;
            // Special case handling, if an entry is directly tied to an exit
            if (instruction.type == TurnType::EnterRotaryAtExit ||
                instruction.type == TurnType::EnterRoundaboutAtExit)
            {
                step.maneuver.exit = 2;
                // prevent futher special case handling of these two.
                if (instruction.type == TurnType::EnterRotaryAtExit)
                    step.maneuver.instruction = TurnType::EnterRotary;
                else
                    step.maneuver.instruction = TurnType::EnterRoundabout;
            }
            on_roundabout = true;
            if (step_index + 1 < steps.size())
                steps[step_index + 1].maneuver.exit = step.maneuver.exit;
        }
        else if (instruction.type == TurnType::StayOnRoundabout)
        {
            // increase the exit number we require passing the exit
            step.maneuver.exit += 1;
            if (step_index + 1 < steps.size())
                steps[step_index + 1].maneuver.exit = step.maneuver.exit;
        }
        else if (leavesRoundabout(instruction))
        {
            if (on_roundabout)
            {
                // Normal exit from the roundabout. Propagate the index back to the entering
                // location and
                // prepare the current silent set of instructions for removal.
                BOOST_ASSERT(step_index > 1);
                // The very first route-step is head, so we cannot iterate past that one
                for (std::size_t propagation_index = step_index - 1; propagation_index > 0;
                     --propagation_index)
                {
                    auto &propagation_step = steps[propagation_index];
                    if (entersRoundabout(propagation_step.maneuver.instruction))
                    {
                        propagation_step.maneuver.exit = step.maneuver.exit;
                        break;
                    }
                    else
                    {
                        BOOST_ASSERT(propagation_step.maneuver.instruction.type =
                                         TurnType::StayOnRoundabout);
                        propagation_step.maneuver.instruction =
                            TurnInstruction::NO_TURN(); // mark intermediate instructions invalid
                    }
                }
                // remove exit
                step.maneuver.instruction = TurnInstruction::NO_TURN();
                on_roundabout = false;
            }
            else
            {
                // We reached a special case that requires the addition of a special route step in
                // the beginning.
                // We started in a roundabout, so to announce the exit, we move use the exit
                // instruction and
                // move it right to the beginning to make sure to immediately announce the exit.
            }
        }
    }
    // unterminated roundabout
    // Move backwards through the instructions until the start and remove the exit number
    // A roundabout without exit translates to enter-roundabout.
    if (on_roundabout)
    {
        for (std::size_t propagation_index = steps.size() - 1; propagation_index > 0;
             --propagation_index)
        {
            auto &propagation_step = steps[propagation_index];
            if (entersRoundabout(propagation_step.maneuver.instruction))
            {
                propagation_step.maneuver.exit = 0;
                break;
            }
            else if (propagation_step.maneuver.instruction == TurnType::StayOnRoundabout)
            {
                propagation_step.maneuver.instruction =
                    TurnInstruction::NO_TURN(); // mark intermediate instructions invalid
            }
        }
    }

    // finally clean up the post-processed instructions.
    // Remove all, now NO_TURN instructions for the set of steps
    auto pos = steps.begin();
    for (auto check = steps.begin(); check != steps.end(); ++check)
    {
        // keep valid instrucstions
        if (check->maneuver.instruction != TurnInstruction::NO_TURN() ||
            check->maneuver.waypoint_type != WaypointType::None)
        {
            *pos = *check;
            ++pos;
        }
    }
    steps.erase(pos, steps.end());
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

    // TODO remove silent turns
    return steps;
}

} // namespace guidance
} // namespace engine
} // namespace osrm
