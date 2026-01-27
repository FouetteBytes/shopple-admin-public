/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.keellssuper.com',
      },
      {
        protocol: 'https',
        hostname: '*.cargillsonline.com',
      },
      {
        protocol: 'https',
        hostname: 'cargillsonline.com',
      }
    ],
    // Enable image optimization with increased timeout
    minimumCacheTTL: 60,
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  },
  transpilePackages: ['iconsax-react'],
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Exclude sql.js from server-side bundling since it's browser-only
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push('sql.js');
    }
    
    // Handle Node.js polyfills for sql.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    return config;
  },
  // Additional configuration to reduce upgrade request errors
  devIndicators: {
    buildActivity: false,
  },
  // Disable built-in eslint to prevent conflicts
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    // In K8s with Ingress, backend is accessed at same origin via /api path
    // Only use NEXT_PUBLIC_BACKEND_URL if explicitly set to a non-localhost value
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    const useRewrite = backendUrl && !backendUrl.includes('localhost:5001') && backendUrl !== 'http://localhost';
    
    if (!useRewrite) {
      // No rewrite needed - Ingress routes /api/* to backend
      return [];
    }
    
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
