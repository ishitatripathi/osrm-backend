#ifndef OSRM_BASE64_HPP
#define OSRM_BASE64_HPP

#include <boost/assert.hpp>
#include <boost/archive/iterators/base64_from_binary.hpp>
#include <boost/archive/iterators/binary_from_base64.hpp>
#include <boost/archive/iterators/transform_width.hpp>

#include <algorithm>
#include <iterator>
#include <string>
#include <vector>

#include <cstdint>
#include <climits>

// RFC 4648 "The Base16, Base32, and Base64 Data Encodings"
// See: https://tools.ietf.org/html/rfc4648

namespace osrm
{
namespace engine
{

namespace detail
{
static_assert(CHAR_BIT == 8u, "we assume a byte holds 8 bits");
static_assert(sizeof(char) == 1u, "we assume a char is one byte large");

using Base64FromBinary = boost::archive::iterators::base64_from_binary<
    boost::archive::iterators::transform_width<const char *, // sequence of chars
                                               6,            // get view of 6 bit
                                               8             // from sequence of 8 bit
                                               >>;

using BinaryFromBase64 = boost::archive::iterators::transform_width<
    boost::archive::iterators::binary_from_base64<std::string::const_iterator>,
    8, // get a view of 8 bit
    6  // from a sequence of 6 bit
    >;
} // ns detail

template <typename T> std::string encodeBase64(const T &x)
{
#if not defined __GNUC__ or __GNUC__ > 4
    static_assert(std::is_trivially_copyable<T>::value, "requires a trivially copyable type");
#endif

    std::vector<unsigned char> bytes{reinterpret_cast<const char *>(&x),
                                     reinterpret_cast<const char *>(&x) + sizeof(T)};
    BOOST_ASSERT(!bytes.empty());

    std::size_t bytes_to_pad{0};

    while (bytes.size() % 3 != 0)
    {
        bytes_to_pad += 1;
        bytes.push_back(0);
    }

    BOOST_ASSERT(bytes_to_pad == 0 || bytes_to_pad == 1 || bytes_to_pad == 2);
    BOOST_ASSERT_MSG(0 == bytes.size() % 3, "base64 input data size is not a multiple of 3");

    std::string encoded{detail::Base64FromBinary{bytes.data()},
                        detail::Base64FromBinary{bytes.data() + (bytes.size() - bytes_to_pad)}};

    std::replace(begin(encoded), end(encoded), '+', '-');
    std::replace(begin(encoded), end(encoded), '/', '_');

    return encoded;
}

template <typename T> T decodeBase64(std::string encoded)
{
#if not defined __GNUC__ or __GNUC__ > 4
    static_assert(std::is_trivially_copyable<T>::value, "requires a trivially copyable type");
#endif

    std::replace(begin(encoded), end(encoded), '-', '+');
    std::replace(begin(encoded), end(encoded), '_', '/');

    T rv;

    std::copy(detail::BinaryFromBase64{begin(encoded)},
              detail::BinaryFromBase64{begin(encoded) + encoded.length()},
              reinterpret_cast<char *>(&rv));

    return rv;
}

} // ns engine
} // ns osrm

#endif /* OSRM_BASE64_HPP */
