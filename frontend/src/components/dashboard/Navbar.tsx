import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import ProfileImage from '@/components/assets/profile.png'
import { Add, CalendarEdit, DirectNotification, SearchNormal1, SidebarLeft, Profile2User, LogoutCurve, Setting2 } from 'iconsax-react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

function Navbar({ isOpen, sidebarChange }: { isOpen: boolean, sidebarChange: (value: boolean) => void }) {
    const { user, isAdmin, logout, isLoggingOut } = useAuth()
    const [showDropdown, setShowDropdown] = useState(false)
    const router = useRouter()
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    const handleLogout = async () => {
        try {
            await logout()
            setShowDropdown(false)
        } catch (error) {
            console.error('Logout error:', error)
        }
    }
    return (
        <div>

            <div className='flex p-4 md:p-6 justify-between items-center'>
                {/* profile/left section */}
                <div className='flex items-center justify-between gap-2'>
                    {user && isAdmin ? (
                        <>
                            <div className='w-10 h-10 bg-primary rounded-full flex items-center justify-center'>
                                <Profile2User size={20} className='text-white' />
                            </div>
                            <div className=''>
                                <p className='text-sm font-semibold text-gray-800'>Admin Panel</p>
                                <p className='text-xs font-medium text-gray-500'>Welcome back</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <Image
                                src={ProfileImage}
                                alt='User'
                                width={40}
                                height={40}
                                className='rounded-full'
                            />
                            <div className=''>
                                <p className='text-sm font-semibold text-gray-800'>Admin Panel</p>
                                <p className='text-xs font-medium text-gray-500'>Welcome back</p>
                            </div>
                        </>
                    )}
                </div>

                <button onClick={() => sidebarChange(!isOpen)} className='all-center text-gray-500 h-8 w-8 md:hidden'>
                    <SidebarLeft size={16} />
                </button>

                {/* right section */}
                <div className='text-gray-500 hidden md:flex gap-2 items-center'>
                    <button className='all-center h-8 w-8 duration-200 hover:bg-gray-100 rounded-lg'>
                        <SearchNormal1 size={16} />
                    </button>

                    <button className='all-center h-8 w-8 duration-200 hover:bg-gray-100 rounded-lg'>
                        <DirectNotification size={16} />
                    </button>

                    {user && isAdmin && (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setShowDropdown(!showDropdown)}
                                className="flex items-center space-x-2 text-sm bg-white border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                            >
                                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                    <Profile2User size={12} className="text-white" />
                                </div>
                                <span className="text-gray-700 text-xs max-w-[100px] truncate">
                                    {user.email}
                                </span>
                            </button>

                            {showDropdown && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        <p className="text-sm font-medium text-gray-900">Admin Account</p>
                                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                    </div>
                                    
                                    <button className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2">
                                        <Setting2 size={14} />
                                        <span>Settings</span>
                                    </button>
                                    
                                    <button
                                        onClick={handleLogout}
                                        disabled={isLoggingOut}
                                        className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-3 disabled:opacity-50 border-t border-gray-100 font-medium duration-200"
                                        title={isLoggingOut ? 'Signing out...' : 'Logout'}
                                    >
                                        {isLoggingOut ? (
                                            <div className="w-5 h-5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin"></div>
                                        ) : (
                                            <div className="flex items-center justify-center w-5 h-5 bg-red-50 rounded">
                                                <LogoutCurve size={14} className="text-red-600" />
                                            </div>
                                        )}
                                        <span className="font-semibold">
                                            {isLoggingOut ? 'Signing out...' : 'Logout'}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>

            <hr className='bg-gray-400 mx-2' />

        </div>
    )
}

export default Navbar