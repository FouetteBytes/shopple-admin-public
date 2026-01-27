"use client"

import React from 'react'
import { Add, DocumentUpload, Setting4, RefreshCircle, Cpu, SearchNormal1 } from 'iconsax-react'
import { useCentralStore } from '@/Store'
import Link from 'next/link'

function QuickActions() {
    const { setActivePage, isProcessing } = useCentralStore()

    const actions = [
        {
            icon: DocumentUpload,
            title: 'Classify Products',
            description: 'Upload and classify new products',
            href: '/app/classifier',
            color: 'bg-blue-500 hover:bg-blue-600',
            disabled: isProcessing
        },
        {
            icon: SearchNormal1,
            title: 'Browse History',
            description: 'View past classifications',
            href: '/app/history',
            color: 'bg-green-500 hover:bg-green-600',
            disabled: false
        },
        {
            icon: RefreshCircle,
            title: 'Cache Management',
            description: 'Optimize cache performance',
            href: '/app/cache',
            color: 'bg-orange-500 hover:bg-orange-600',
            disabled: false
        },
        {
            icon: Setting4,
            title: 'System Settings',
            description: 'Configure AI models',
            href: '/app/settings',
            color: 'bg-gray-500 hover:bg-gray-600',
            disabled: false
        }
    ]

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
            {/* header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <Cpu size={18} />
                    <p className='text-gray-800 font-medium'>Quick Actions</p>
                </div>
                <button className='border flex items-center gap-1 px-2 py-1 rounded-lg text-xs'>
                    <Add size={14} />
                    Customize
                </button>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* content */}
            <div className='grid grid-cols-1 gap-3'>
                {actions.map((action, index) => (
                    <Link 
                        key={index}
                        href={action.href}
                        className={`group ${action.disabled ? 'pointer-events-none opacity-50' : ''}`}
                    >
                        <div className='flex items-center gap-3 p-3 rounded-lg border hover:border-gray-300 transition-all duration-200 hover:shadow-sm cursor-pointer'>
                            <div className={`w-10 h-10 rounded-lg ${action.color} flex items-center justify-center text-white transition-all duration-200`}>
                                <action.icon size={20} />
                            </div>
                            <div className='flex-1'>
                                <p className='text-sm font-medium text-gray-800 group-hover:text-gray-900'>
                                    {action.title}
                                    {action.disabled && (
                                        <span className='ml-2 text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full'>
                                            Processing...
                                        </span>
                                    )}
                                </p>
                                <p className='text-xs text-gray-500'>{action.description}</p>
                            </div>
                            <div className='w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200'>
                                <svg className='w-3 h-3 text-gray-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M9 5l7 7-7 7' />
                                </svg>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Status indicator */}
            <div className='mt-4 p-3 bg-gray-50 rounded-lg'>
                <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                        <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                        <span className='text-xs text-gray-600'>
                            System Status: {isProcessing ? 'Processing' : 'Ready'}
                        </span>
                    </div>
                    <span className='text-xs text-gray-500'>
                        {new Date().toLocaleTimeString()}
                    </span>
                </div>
            </div>
        </div>
    )
}

export default QuickActions
