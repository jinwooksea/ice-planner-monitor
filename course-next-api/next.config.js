/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.teacherville.co.kr",
      },
    ],
  },
};

module.exports = nextConfig;
