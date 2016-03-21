#ifndef PROFILE_PROPERTIES_HPP
#define PROFILE_PROPERTIES_HPP

namespace osrm
{
namespace extractor
{

struct ProfileProperties
{
    ProfileProperties()
        : traffic_signal_penalty(0), u_turn_penalty(0), allow_u_turn_at_via(false), use_turn_restrictions(false)
    {
    }

    double GetUturnPenalty() const
    {
        return u_turn_penalty / 10.;
    }

    void SetUturnPenalty(const double u_turn_penalty_)
    {
        u_turn_penalty = static_cast<int>(u_turn_penalty_ * 10.);
    }

    double GetTrafficSignalPenalty() const
    {
        return traffic_signal_penalty / 10.;
    }

    void SetTrafficSignalPenalty(const double traffic_signal_penalty_)
    {
        traffic_signal_penalty = static_cast<int>(traffic_signal_penalty_ * 10.);
    }

    //! penalty to cross a traffic light in deci-seconds
    int traffic_signal_penalty;
    //! penalty to do a uturn in deci-seconds
    int u_turn_penalty;
    bool allow_u_turn_at_via;
    bool use_turn_restrictions;
};
}
}

#endif
