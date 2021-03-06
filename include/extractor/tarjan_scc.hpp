#ifndef TARJAN_SCC_HPP
#define TARJAN_SCC_HPP

#include "util/typedefs.hpp"
#include "util/deallocating_vector.hpp"
#include "extractor/node_based_edge.hpp"
#include "extractor/query_node.hpp"
#include "util/percent.hpp"

#include "util/integer_range.hpp"
#include "util/simple_logger.hpp"
#include "util/std_hash.hpp"
#include "util/timing_util.hpp"

#include "osrm/coordinate.hpp"
#include <boost/assert.hpp>
#include <cstdint>

#include <memory>
#include <algorithm>
#include <climits>
#include <stack>
#include <vector>

namespace osrm
{
namespace extractor
{

template <typename GraphT> class TarjanSCC
{
    struct TarjanStackFrame
    {
        explicit TarjanStackFrame(NodeID v, NodeID parent) : v(v), parent(parent) {}
        NodeID v;
        NodeID parent;
    };

    struct TarjanNode
    {
        TarjanNode() : index(SPECIAL_NODEID), low_link(SPECIAL_NODEID), on_stack(false) {}
        unsigned index;
        unsigned low_link;
        bool on_stack;
    };

    std::vector<unsigned> components_index;
    std::vector<NodeID> component_size_vector;
    std::shared_ptr<const GraphT> m_graph;
    std::size_t size_one_counter;

  public:
    TarjanSCC(std::shared_ptr<const GraphT> graph)
        : components_index(graph->GetNumberOfNodes(), SPECIAL_NODEID), m_graph(graph),
          size_one_counter(0)
    {
        BOOST_ASSERT(m_graph->GetNumberOfNodes() > 0);
    }

    void run()
    {
        TIMER_START(SCC_RUN);
        const NodeID max_node_id = m_graph->GetNumberOfNodes();

        // The following is a hack to distinguish between stuff that happens
        // before the recursive call and stuff that happens after
        std::stack<TarjanStackFrame> recursion_stack;
        // true = stuff before, false = stuff after call
        std::stack<NodeID> tarjan_stack;
        std::vector<TarjanNode> tarjan_node_list(max_node_id);
        unsigned component_index = 0, size_of_current_component = 0;
        unsigned index = 0;
        std::vector<bool> processing_node_before_recursion(max_node_id, true);
        for (const NodeID node : util::irange(0u, max_node_id))
        {
            if (SPECIAL_NODEID == components_index[node])
            {
                recursion_stack.emplace(TarjanStackFrame(node, node));
            }

            while (!recursion_stack.empty())
            {
                TarjanStackFrame currentFrame = recursion_stack.top();
                const NodeID u = currentFrame.parent;
                const NodeID v = currentFrame.v;
                recursion_stack.pop();

                const bool before_recursion = processing_node_before_recursion[v];

                if (before_recursion && tarjan_node_list[v].index != UINT_MAX)
                {
                    continue;
                }

                if (before_recursion)
                {
                    // Mark frame to handle tail of recursion
                    recursion_stack.emplace(currentFrame);
                    processing_node_before_recursion[v] = false;

                    // Mark essential information for SCC
                    tarjan_node_list[v].index = index;
                    tarjan_node_list[v].low_link = index;
                    tarjan_stack.push(v);
                    tarjan_node_list[v].on_stack = true;
                    ++index;

                    for (const auto current_edge : m_graph->GetAdjacentEdgeRange(v))
                    {
                        const auto vprime = m_graph->GetTarget(current_edge);

                        if (SPECIAL_NODEID == tarjan_node_list[vprime].index)
                        {
                            recursion_stack.emplace(TarjanStackFrame(vprime, v));
                        }
                        else
                        {
                            if (tarjan_node_list[vprime].on_stack &&
                                tarjan_node_list[vprime].index < tarjan_node_list[v].low_link)
                            {
                                tarjan_node_list[v].low_link = tarjan_node_list[vprime].index;
                            }
                        }
                    }
                }
                else
                {
                    processing_node_before_recursion[v] = true;
                    tarjan_node_list[u].low_link =
                        std::min(tarjan_node_list[u].low_link, tarjan_node_list[v].low_link);
                    // after recursion, lets do cycle checking
                    // Check if we found a cycle. This is the bottom part of the recursion
                    if (tarjan_node_list[v].low_link == tarjan_node_list[v].index)
                    {
                        NodeID vprime;
                        do
                        {
                            vprime = tarjan_stack.top();
                            tarjan_stack.pop();
                            tarjan_node_list[vprime].on_stack = false;
                            components_index[vprime] = component_index;
                            ++size_of_current_component;
                        } while (v != vprime);

                        component_size_vector.emplace_back(size_of_current_component);

                        if (size_of_current_component > 1000)
                        {
                            util::SimpleLogger().Write() << "large component [" << component_index
                                                         << "]=" << size_of_current_component;
                        }

                        ++component_index;
                        size_of_current_component = 0;
                    }
                }
            }
        }

        TIMER_STOP(SCC_RUN);
        util::SimpleLogger().Write() << "SCC run took: " << TIMER_MSEC(SCC_RUN) / 1000. << "s";

        size_one_counter = std::count_if(component_size_vector.begin(), component_size_vector.end(),
                                         [](unsigned value)
                                         {
                                             return 1 == value;
                                         });
    }

    std::size_t get_number_of_components() const { return component_size_vector.size(); }

    std::size_t get_size_one_count() const { return size_one_counter; }

    unsigned get_component_size(const unsigned component_id) const
    {
        return component_size_vector[component_id];
    }

    unsigned get_component_id(const NodeID node) const { return components_index[node]; }
};
}
}

#endif /* TARJAN_SCC_HPP */
