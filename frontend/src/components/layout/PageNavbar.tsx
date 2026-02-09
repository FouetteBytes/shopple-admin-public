'use client'

import React from 'react'
import { SidebarLeft } from 'iconsax-react'
import { useCentralStore } from '@/Store'
import { API_BASE_URL } from '@/lib/api'

const SIMPLE_HEALTH_ENDPOINT = `${API_BASE_URL}/api/health`
const CLOCK_SYNC_INTERVAL_MS = 60_000
const CLOCK_TICK_INTERVAL_MS = 1_000

const formatServerTime = (utcTimestamp: number) => {
    const baseDate = new Date(utcTimestamp)
    const formatterOptions: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
    }

    // Always display in Asia/Colombo timezone so it matches
    // all other time displays (schedule cards, countdowns, etc.)
    const formatted = new Intl.DateTimeFormat('en-US', {
        ...formatterOptions,
        timeZone: 'Asia/Colombo'
    }).format(baseDate)

    return formatted
}

const ServerClock: React.FC = () => {
    const [displayTime, setDisplayTime] = React.useState('Syncing server time…')
    const [syncState, setSyncState] = React.useState<'syncing' | 'ready' | 'error'>('syncing')

    const syncStateRef = React.useRef(syncState)
    const utcDeltaRef = React.useRef(0)

    const updateSyncState = React.useCallback((state: 'syncing' | 'ready' | 'error') => {
        syncStateRef.current = state
        setSyncState(state)
    }, [])

    React.useEffect(() => {
        let isMounted = true

        const fetchServerTime = async () => {
            try {
                if (isMounted && syncStateRef.current !== 'ready') {
                    updateSyncState('syncing')
                }

                const response = await fetch(SIMPLE_HEALTH_ENDPOINT, {
                    cache: 'no-store'
                })

                if (!response.ok) {
                    throw new Error('Failed to fetch health endpoint')
                }

                const payload = await response.json()
                const timestamp = payload?.timestamp as string | undefined

                if (!timestamp) {
                    throw new Error('Missing timestamp in server response')
                }

                const serverUtcTimestamp = Date.parse(timestamp)
                if (Number.isNaN(serverUtcTimestamp)) {
                    throw new Error('Invalid timestamp received from server')
                }

                utcDeltaRef.current = serverUtcTimestamp - Date.now()

                if (isMounted) {
                    updateSyncState('ready')
                    setDisplayTime(formatServerTime(serverUtcTimestamp))
                }
            } catch (error) {
                console.error('Unable to synchronize server time', error)
                if (isMounted) {
                    updateSyncState('error')
                    setDisplayTime('Server time unavailable')
                }
            }
        }

        const updateDisplay = () => {
            if (!isMounted || syncStateRef.current === 'error') return
            const serverUtcNow = Date.now() + utcDeltaRef.current
            setDisplayTime(formatServerTime(serverUtcNow))
        }

        fetchServerTime()
        const syncInterval = window.setInterval(fetchServerTime, CLOCK_SYNC_INTERVAL_MS)
        const tickInterval = window.setInterval(updateDisplay, CLOCK_TICK_INTERVAL_MS)

        return () => {
            isMounted = false
            window.clearInterval(syncInterval)
            window.clearInterval(tickInterval)
        }
    }, [updateSyncState])

    const statusColor = syncState === 'error'
        ? 'bg-red-500'
        : syncState === 'syncing'
            ? 'bg-amber-500'
            : 'bg-emerald-500'

    return (
        <div className='inline-flex items-center gap-2 text-xs text-gray-500 font-mono whitespace-nowrap px-3 py-1 rounded-lg border border-gray-200 bg-white/70 shadow-sm'>
            <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} aria-hidden='true' />
            <span>{displayTime}</span>
        </div>
    )
}




const PageNavbarLeftContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentPropsWithoutRef<'div'>
>((props, ref) =>
    <div
        ref={ref}
        className='flex items-center justify-between gap-2 h-10'
        {...props} />
);

PageNavbarLeftContent.displayName = 'PageNavbarLeftContent'


const PageNavbarRightContent = React.forwardRef<
    HTMLDivElement,
    React.ComponentPropsWithoutRef<'div'>
>(({ className, children, ...props }, ref) => {
    const combinedClassName = ['text-gray-500 hidden md:flex gap-2 items-center', className]
        .filter(Boolean)
        .join(' ')

    return (
        <div
            ref={ref}
            className={combinedClassName}
            {...props}
        >
            <ServerClock />
            {children}
        </div>
    )
});

PageNavbarRightContent.displayName = 'PageNavbarRightContent'


const PageNavbarIconButton = React.forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<'button'>>
    (({ className, ...props }, ref) =>
        <button
            ref={ref}
            className='all-center h-8 w-8 duration-200 hover:bg-gray-100 rounded-lg'
            {...props} />
    )

PageNavbarIconButton.displayName = 'PageNavbarIconButton'

const PageNavbarPrimaryButton = React.forwardRef<
    HTMLButtonElement,
    React.ComponentPropsWithoutRef<'button'>>
    (({ className, ...props }, ref) =>
        <button
            ref={ref}
            className='h-8 gap-1 bg-primary hidden py-1 px-2 duration-200 text-white rounded-lg text-xs md:flex items-center justify-center'
            {...props}
        />
    )
PageNavbarPrimaryButton.displayName = 'PageNavbarPrimaryButton'


function PageNavbar({ children }: { children: React.ReactNode }) {

    const { setIsSidebarOpen } = useCentralStore()

    return (
        <div className="sticky top-0 z-30 w-full border-b border-white/20 bg-white/70 backdrop-blur-xl transition-all supports-[backdrop-filter]:bg-white/60">
            <div className='h-[var(--h-nav)] flex px-4 md:px-6 text-gray-500 justify-between items-center'>

                {children}

                <button onClick={() => setIsSidebarOpen(true)} className='all-center text-gray-500 h-8 w-8 md:hidden'>
                    <SidebarLeft size={16} />
                </button>

            </div>
        </div>
    )
}

export default PageNavbar

export { PageNavbarLeftContent, PageNavbarRightContent, PageNavbarIconButton, PageNavbarPrimaryButton }
