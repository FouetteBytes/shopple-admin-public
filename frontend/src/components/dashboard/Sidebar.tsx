"use client"

import Image from 'next/image'
import { ArrowRight2, Calendar,ElementEqual,Bezier,Strongbox,Coin1,ChartSquare, Document, Element3, DirectInbox, Headphone, Profile2User, Setting2, Setting4, Star, Timer1, Triangle, Data, Activity, DocumentUpload, Cpu, LogoutCurve, Shield,Okb, DocumentText, UserAdd } from 'iconsax-react'
import ProfileImage from '@/components/assets/profile.png'
import Link, { LinkProps } from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCentralStore } from '@/Store'
import { useAuth } from '@/contexts/AuthContext'
import React, { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'


function Sidebar() {

    const pathname = usePathname()
    const router = useRouter()
    const { setIsSidebarOpen, isSidebarOpen } = useCentralStore()
    const { user, isAdmin, logout, isLoggingOut } = useAuth()
    const [uploadedToday, setUploadedToday] = useState(false)

    useEffect(() => {
        const todayKey = new Date().toISOString().split('T')[0]
        let unsubscribe: (() => void) | undefined
        try {
            // Primary: listen to Firestore for today's count
            const ref = doc(db, 'price_uploads_daily', todayKey)
            unsubscribe = onSnapshot(ref, (snap) => {
                const count = (snap.exists() && (snap.data() as any)?.count) || 0
                setUploadedToday(count > 0)
            }, () => {
                // Fallback: use localStorage
                const stored = typeof window !== 'undefined' ? localStorage.getItem('pricesUploadedOn') : null
                setUploadedToday(!!stored && stored === todayKey)
            })
        } catch {
            const stored = typeof window !== 'undefined' ? localStorage.getItem('pricesUploadedOn') : null
            setUploadedToday(!!stored && stored === todayKey)
        }
        return () => { try { unsubscribe && unsubscribe() } catch {} }
    }, [])

    const handleLogout = async () => {
        try {
            await logout()
        } catch (error) {
            console.error('Logout error:', error)
        }
    }

    return (
        <div className='w-60 shrink-0 md:block h-screen fixed top-0 left-0 z-10 overflow-hidden'>
            <div className='w-full h-full bg-white/70 backdrop-blur-xl border-r border-white/40 shadow-2xl'>
                {/* logo */}
                <div className='h-[var(--h-nav)] p-4 md:p-6 flex cursor-pointer group items-center gap-2'>
                    <div className='h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 shadow-sm border border-indigo-100 overflow-hidden'>
                        <Image 
                            src="/shopple-admin-icon.png" 
                            alt="Shopple Admin" 
                            width={32} 
                            height={32} 
                            className='object-contain group-hover:scale-110 duration-200'
                        />
                    </div>
                    <div>
                        <h1 className='text-sm font-bold text-gray-800'>Admin Dashboard</h1>
                        <p className='text-xs text-gray-500 font-medium'>Product Management</p>
                    </div>
                </div>

                {/* section divider */}
                <hr className='bg-gray-400 mx-2' />

                {/* other section */}
                <div className='flex flex-col h-full justify-between'>
                    {/* top */}
                    <div className='pt-6 text-gray-500 font-medium space-y-2 md:px-2 text-xs'>
                        <Link href={'/app/dashboard'} className={`flex ${pathname === '/app/dashboard' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <Element3 variant='Outline' size={16} />
                            Dashboard
                        </Link>

                        <Link href={'/app/classifier'} className={`flex ${pathname === '/app/classifier' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <DocumentUpload size={16} />
                            Classifier
                        </Link>

                        <Link href={'/app/cache'} className={`flex ${pathname === '/app/cache' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <Strongbox size={16} />
                            Cache Management
                        </Link>

                        <Link href={'/app/crawler'} className={`flex ${pathname === '/app/crawler' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <Bezier size={16} />
                            Web Crawler
                        </Link>

                        <Link href={'/app/products'} className={`flex ${pathname === '/app/products' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <DirectInbox size={16} />
                            Product Uploads
                        </Link>                        
                        {isAdmin && (
                            <Link href={'/app/audit'} className={`flex ${pathname === '/app/audit' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                                <Shield size={16} />
                                Audit Trail
                            </Link>
                        )}
                        <Link href={'/app/pricing/upload'} className={`flex ${pathname === '/app/pricing/upload' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <Coin1 size={16} />
                            Upload Prices
                            {uploadedToday && (
                                <span className="ml-auto inline-flex items-center">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                </span>
                            )}
                        </Link>

                        <Link href={'/app/products/manage'} className={`flex ${pathname === '/app/products/manage' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <Okb size={16} />
                            Product Database
                        </Link>

                        <Link href={'/app/product-requests'} className={`flex ${pathname === '/app/product-requests' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <DocumentText size={16} />
                            Product Requests
                        </Link>

                        <Link href={'/app/users/online'} className={`flex ${pathname === '/app/users/online' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <Activity size={16} />
                            Active Users
                        </Link>

                        <Link href={'/app/pricing'} className={`flex ${pathname === '/app/pricing' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <ElementEqual size={16} />
                            Price Management
                        </Link>

                        {/* Admin Management - Show for all admins but with different access levels */}
                        {user?.isAdmin && (
                            <Link href={'/app/admin'} className={`flex ${pathname === '/app/admin' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                                <Shield size={16} />
                                <span>Admin Management</span>
                                {!user?.isSuperAdmin && (
                                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full ml-auto">View</span>
                                )}
                            </Link>
                        )}

                        {user?.isSuperAdmin && (
                            <Link href={'/app/admin/accounts'} className={`flex ${pathname === '/app/admin/accounts' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                                <UserAdd size={16} />
                                <span>Account Factory</span>
                                <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full ml-auto">New</span>
                            </Link>
                        )}

                        <button disabled className={`flex ${pathname === '/app/analytics' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl disabled:opacity-60 duration-200 px-6 py-2 items-center gap-2`}>
                            <Star size={16} />
                            Analytics
                        </button>

                        <Link href={'/app/history'} className={`flex ${pathname === '/app/history' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                            <ChartSquare size={16} />
                            Pricing Analytics
                        </Link>
                    </div>

                    <div>
                        <div className='text-gray-500 text-xs font-medium md:px-2'>
                            <Link href={'/app/settings'} className={`flex ${pathname === '/app/settings' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                                <Setting2 size={16} />
                                Settings
                            </Link>

                            <Link href={'/app/support'} className={`flex ${pathname === '/app/support' ? 'text-primary bg-indigo-50 rounded-xl' : ''} hover:px-8 hover:bg-gray-50 hover:rounded-xl duration-200 px-6 py-2 items-center gap-2`}>
                                <Headphone size={16} />
                                Support
                            </Link>
                        </div>

                        <hr className='bg-gray-400 mx-2 my-4' />

                        {/* bottom - admin profile */}
                        {user && isAdmin && (
                            <div className='flex pb-28 justify-between px-4 md:px-6 items-center cursor-pointer hover:pr-5 duration-200 group'>
                                <div className='flex items-center gap-2'>
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-105 duration-200 shadow-sm ${
                                        user.isSuperAdmin ? 'bg-gradient-to-br from-indigo-500 to-violet-500' : 'bg-gradient-to-br from-indigo-400 to-violet-400'
                                    }`}>
                                        <Profile2User size={18} className='text-white' />
                                    </div>
                                    <div className=''>
                                        <div className="flex items-center gap-1">
                                            <p className='text-sm font-semibold text-gray-800'>
                                                {user.isSuperAdmin ? 'Super Admin' : 'Admin'}
                                            </p>
                                            {user.isSuperAdmin && (
                                                <Shield size={12} className="text-primary" />
                                            )}
                                        </div>
                                        <p className='text-xs font-medium text-gray-500 truncate max-w-[120px]'>
                                            {user.email}
                                        </p>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                    className='text-gray-500 hover:text-red-500 disabled:opacity-50 duration-200 opacity-70 group-hover:opacity-100 relative'
                                    title={isLoggingOut ? "Signing out..." : "Logout"}
                                >
                                    {isLoggingOut ? (
                                        <div className="w-5 h-5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin"></div>
                                    ) : (
                                        <LogoutCurve size={18} className="text-gray-500 hover:text-red-500 transition-colors" />
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                </div>

            </div>
        </div>
    )
}


const NavbarLink = ({ href, active }: { href: string, active: boolean }) => {
    return (
        <Link
            href={href}

        >

        </Link>
    )
}

const NavLink = React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { href: string }>
    (({ className, href, ...props }, ref) =>
        <Link
            href={href}
            ref={ref}
            className={`flex ${window.location.pathname === href ? 'text-primary' : ''} hover:px-8 duration-200 rounded-md w-full py-2 px-6 items-center gap-2`}
            {...props}
        />
    )
NavLink.displayName = 'NavLink'


export default Sidebar
