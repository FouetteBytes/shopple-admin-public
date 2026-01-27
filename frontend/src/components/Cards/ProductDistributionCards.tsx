"use client"

import { Chart, Category2, Building4 } from 'iconsax-react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

interface PricingStats {
  supermarket_stats: Record<string, number>
  category_stats: Record<string, { count: number, products: string[] }>
  brand_stats: Record<string, { count: number, products: string[] }>
}

interface DistributionCardProps {
  stats: PricingStats | null
  loading: boolean
}

// Supermarket Distribution Card
export const SupermarketDistributionCard = ({ stats, loading }: DistributionCardProps) => {

  if (loading) {
    return (
      <div className='bg-white border rounded-xl p-6 h-64'>
        <div className='flex items-center gap-2 mb-4'>
          <Chart size={20} className='text-blue-600' />
          <h3 className='font-semibold text-gray-800'>Supermarket Distribution</h3>
        </div>
        <div className='flex items-center justify-center h-40'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
        </div>
      </div>
    )
  }

  const data = stats ? Object.entries(stats.supermarket_stats).map(([name, count]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: count
  })) : []

  return (
    <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white hover:shadow-lg transition-shadow duration-200'>
      <div className='flex items-center text-sm gap-2 mb-4'>
        <Chart size={18} className='text-blue-600' />
        <p className='text-gray-800 font-medium'>Supermarket Distribution</p>
      </div>
      <hr className='bg-gray-300 my-3' />
      <div className='h-40'>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip 
              formatter={(value: any) => [`${value} products`, 'Products']}
            />
            <Bar dataKey="value" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length === 0 && (
        <p className='text-xs text-gray-500 mt-2'>*No pricing data available - Add products to see distribution</p>
      )}
    </div>
  )
}

// Category Distribution Card
export const CategoryDistributionCard = ({ stats, loading }: DistributionCardProps) => {

  if (loading) {
    return (
      <div className='bg-white border rounded-xl p-6 h-64'>
        <div className='flex items-center gap-2 mb-4'>
          <Category2 size={20} className='text-green-600' />
          <h3 className='font-semibold text-gray-800'>Category Distribution</h3>
        </div>
        <div className='flex items-center justify-center h-40'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-600'></div>
        </div>
      </div>
    )
  }

  const data = stats ? Object.entries(stats.category_stats).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: data.count
  })) : []

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

  return (
    <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white hover:shadow-lg transition-shadow duration-200'>
      <div className='flex items-center text-sm gap-2 mb-4'>
        <Category2 size={18} className='text-green-600' />
        <p className='text-gray-800 font-medium'>Category Distribution</p>
      </div>
      <hr className='bg-gray-300 my-3' />
      <div className='h-40'>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip 
              formatter={(value: any) => [`${value} products`, 'Products']}
            />
            <Bar dataKey="value" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Top Brands Card
export const TopBrandsCard = ({ stats, loading }: DistributionCardProps) => {

  if (loading) {
    return (
      <div className='bg-white border rounded-xl p-6 h-64'>
        <div className='flex items-center gap-2 mb-4'>
          <Building4 size={20} className='text-purple-600' />
          <h3 className='font-semibold text-gray-800'>Top Brands</h3>
        </div>
        <div className='flex items-center justify-center h-40'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600'></div>
        </div>
      </div>
    )
  }

  const data = stats ? Object.entries(stats.brand_stats)
    .sort(([,a], [,b]) => b.count - a.count)
    .slice(0, 6)
    .map(([name, data]) => ({
      name: name,
      value: data.count
    })) : []

  const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

  return (
    <div className='border text-gray-500 w-full p-4 rounded-2xl bg-white hover:shadow-lg transition-shadow duration-200'>
      <div className='flex items-center text-sm gap-2 mb-4'>
        <Building4 size={18} className='text-purple-600' />
        <p className='text-gray-800 font-medium'>Top Brands</p>
      </div>
      <hr className='bg-gray-300 my-3' />
      <div className='h-48'>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={true}
              label={(entry: any) => {
                if (!entry.percent || entry.percent < 0.05) return ''; // Hide labels for very small slices
                return `${entry.name}\n${(entry.percent * 100).toFixed(1)}%`;
              }}
              outerRadius={70}
              fill="#8884d8"
              dataKey="value"
              fontSize={10}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: any, name: any, props: any) => [
                `${value} products (${((value / data.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%)`,
                'Products'
              ]}
              labelFormatter={(label) => `Brand: ${label}`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
