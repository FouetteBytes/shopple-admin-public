"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Timer1, Clock, Play, Pause, Stop, Archive, Setting2, ArrowDown2, More } from 'iconsax-react'
import { motion, AnimatePresence } from 'framer-motion'

interface TimerSession {
    id: string
    projectName: string
    description: string
    startTime: Date
    endTime?: Date
    duration: number // in seconds
    status: 'active' | 'paused' | 'completed'
}

interface NotificationSettings {
    enabled: boolean
    intervalMinutes: number
    breakReminder: boolean
    breakIntervalMinutes: number
}

function TimeTracker() {
    const [isActive, setIsActive] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [time, setTime] = useState(0) // time in seconds
    const [currentProject, setCurrentProject] = useState('Product Classification')
    const [isCustomTask, setIsCustomTask] = useState(false)
    const [customTaskName, setCustomTaskName] = useState('')
    const [description, setDescription] = useState('')
    const [sessions, setSessions] = useState<TimerSession[]>([])
    const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
        enabled: true,
        intervalMinutes: 25, // Pomodoro technique default
        breakReminder: true,
        breakIntervalMinutes: 5
    })
    const [hasNotificationPermission, setHasNotificationPermission] = useState(false)
    const [nextBreakTime, setNextBreakTime] = useState<Date | null>(null)
    const [showSettings, setShowSettings] = useState(false)
    const [showTaskDropdown, setShowTaskDropdown] = useState(false)
    
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const breakTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const predefinedTasks = [
        'Product Classification',
        'Data Processing',
        'Model Training',
        'System Maintenance',
        'Report Generation',
        'Custom Task...'
    ]

    // Request notification permission on component mount
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (window.Notification.permission === 'granted') {
                setHasNotificationPermission(true)
            } else if (window.Notification.permission !== 'denied') {
                window.Notification.requestPermission().then((permission) => {
                    setHasNotificationPermission(permission === 'granted')
                })
            }
        }
    }, [])

    // Load sessions from localStorage
    useEffect(() => {
        const savedSessions = localStorage.getItem('timerSessions')
        const savedSettings = localStorage.getItem('notificationSettings')
        
        if (savedSessions) {
            try {
                setSessions(JSON.parse(savedSessions))
            } catch (error) {
                console.error('Failed to load timer sessions:', error)
            }
        }
        
        if (savedSettings) {
            try {
                setNotificationSettings(JSON.parse(savedSettings))
            } catch (error) {
                console.error('Failed to load notification settings:', error)
            }
        }
    }, [])

    // Save sessions to localStorage
    useEffect(() => {
        localStorage.setItem('timerSessions', JSON.stringify(sessions))
    }, [sessions])

    // Save notification settings to localStorage
    useEffect(() => {
        localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings))
    }, [notificationSettings])

    // Timer logic
    useEffect(() => {
        if (isActive && !isPaused) {
            intervalRef.current = setInterval(() => {
                setTime(time => time + 1)
            }, 1000)
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [isActive, isPaused])

    // Notification logic
    useEffect(() => {
        if (isActive && !isPaused && notificationSettings.enabled && hasNotificationPermission) {
            // Set notification for work interval
            const workNotificationTime = notificationSettings.intervalMinutes * 60 * 1000
            notificationTimeoutRef.current = setTimeout(() => {
                showNotification(
                    '⏰ Work Session Complete!',
                    `You've completed a ${notificationSettings.intervalMinutes} minute work session. Time for a break!`
                )
                
                // Set break reminder
                if (notificationSettings.breakReminder) {
                    const breakTime = new Date(Date.now() + notificationSettings.breakIntervalMinutes * 60 * 1000)
                    setNextBreakTime(breakTime)
                    
                    breakTimeoutRef.current = setTimeout(() => {
                        showNotification(
                            ' Break Time Over!',
                            `Your ${notificationSettings.breakIntervalMinutes} minute break is complete. Ready to get back to work?`
                        )
                        setNextBreakTime(null)
                    }, notificationSettings.breakIntervalMinutes * 60 * 1000)
                }
            }, workNotificationTime)
        }

        return () => {
            if (notificationTimeoutRef.current) {
                clearTimeout(notificationTimeoutRef.current)
            }
            if (breakTimeoutRef.current) {
                clearTimeout(breakTimeoutRef.current)
            }
        }
    }, [isActive, isPaused, notificationSettings, hasNotificationPermission])

    const showNotification = (title: string, body: string) => {
        if (hasNotificationPermission && typeof window !== 'undefined' && 'Notification' in window) {
            new window.Notification(title, {
                body,
                icon: '/favicon.ico',
                requireInteraction: true,
                tag: 'time-tracker'
            })
        }
    }

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        return hrs > 0 
            ? `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const handleStart = () => {
        setIsActive(true)
        setIsPaused(false)
    }

    const handlePause = () => {
        setIsPaused(!isPaused)
    }

    const handleStop = () => {
        setIsActive(false)
        setIsPaused(false)
        
        // Save session if there was time tracked
        if (time > 0) {
            const session: TimerSession = {
                id: Date.now().toString(),
                projectName: isCustomTask ? customTaskName || 'Custom Task' : currentProject,
                description,
                startTime: new Date(Date.now() - time * 1000),
                endTime: new Date(),
                duration: time,
                status: 'completed'
            }
            
            setSessions(prev => [session, ...prev].slice(0, 10)) // Keep only last 10 sessions
        }
        
        setTime(0)
        setDescription('')
        setNextBreakTime(null)
    }

    const formatSessionTime = (duration: number) => {
        const hours = Math.floor(duration / 3600)
        const minutes = Math.floor((duration % 3600) / 60)
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
    }

    const getProductivityTip = () => {
        const tips = [
            " Use the 25-minute Pomodoro technique for focused work sessions",
            " Set specific goals for each time tracking session", 
            "☕ Take regular breaks to maintain productivity",
            " Turn off distractions during focused work time",
            " Review your time logs to identify productivity patterns"
        ]
        return tips[Math.floor(Math.random() * tips.length)]
    }

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl bg-white min-h-[400px] flex flex-col'>
            {/* header */}
            <div className='flex items-center justify-between flex-shrink-0'>
                <div className='flex items-center text-sm gap-2'>
                    <Timer1 size={18} />
                    <p className='text-gray-800 font-medium'>Time Tracker</p>
                </div>
                <div className='flex items-center gap-2'>
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className='p-1 rounded hover:bg-gray-100 transition-colors'
                        title='Settings'
                    >
                        <Setting2 size={14} />
                    </button>
                    <button className='border flex items-center gap-1 px-2 py-1 rounded-lg text-xs'>
                        <Clock size={14} />
                        History
                    </button>
                </div>
            </div>

            <hr className='bg-gray-400 my-4 flex-shrink-0' />

            {/* Settings Panel */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className='mb-4 p-3 bg-gray-50 rounded-lg'
                    >
                        <h4 className='font-medium text-gray-800 mb-3'>Notification Settings</h4>
                        <div className='space-y-3'>
                            <div className='flex items-center justify-between'>
                                <label className='text-sm text-gray-600'>Enable Notifications</label>
                                <input
                                    type='checkbox'
                                    checked={notificationSettings.enabled}
                                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                                    className='w-4 h-4'
                                />
                            </div>
                            <div className='flex items-center justify-between'>
                                <label className='text-sm text-gray-600'>Work Interval (minutes)</label>
                                <input
                                    type='number'
                                    min='1'
                                    max='120'
                                    value={notificationSettings.intervalMinutes}
                                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, intervalMinutes: parseInt(e.target.value) || 25 }))}
                                    className='w-16 px-2 py-1 text-sm border rounded'
                                />
                            </div>
                            <div className='flex items-center justify-between'>
                                <label className='text-sm text-gray-600'>Break Reminders</label>
                                <input
                                    type='checkbox'
                                    checked={notificationSettings.breakReminder}
                                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, breakReminder: e.target.checked }))}
                                    className='w-4 h-4'
                                />
                            </div>
                            <div className='flex items-center justify-between'>
                                <label className='text-sm text-gray-600'>Break Duration (minutes)</label>
                                <input
                                    type='number'
                                    min='1'
                                    max='30'
                                    value={notificationSettings.breakIntervalMinutes}
                                    onChange={(e) => setNotificationSettings(prev => ({ ...prev, breakIntervalMinutes: parseInt(e.target.value) || 5 }))}
                                    className='w-16 px-2 py-1 text-sm border rounded'
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* content */}
            <div className='flex-1 flex flex-col min-h-0'>
                {/* timer */}
                <div className='rounded-lg border overflow-hidden flex-shrink-0'>
                    {/* timer head */}
                    <div 
                        className='bg-gray-100 py-1 px-2 flex items-center justify-between cursor-pointer'
                        onClick={() => setShowTaskDropdown(!showTaskDropdown)}
                    >
                        <div className='flex items-center gap-1'>
                            <div className='w-4 h-4 rounded-full bg-primary flex items-center justify-center'>
                                <div className='w-2 h-2 rounded-full bg-white'></div>
                            </div>
                            <p className='text-sm'>
                                {isCustomTask ? customTaskName || 'Custom Task' : currentProject}
                            </p>
                        </div>
                        <ArrowDown2 size={16} className={`transition-transform ${showTaskDropdown ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Task Dropdown */}
                    <AnimatePresence>
                        {showTaskDropdown && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className='bg-white border-t overflow-hidden'
                            >
                                <div className='p-2 space-y-1'>
                                    {predefinedTasks.map((task) => (
                                        <button
                                            key={task}
                                            onClick={() => {
                                                if (task === 'Custom Task...') {
                                                    setIsCustomTask(true)
                                                    setCurrentProject('Custom Task')
                                                } else {
                                                    setIsCustomTask(false)
                                                    setCurrentProject(task)
                                                }
                                                setShowTaskDropdown(false)
                                            }}
                                            className='w-full text-left px-2 py-1 text-sm hover:bg-gray-50 rounded transition-colors'
                                        >
                                            {task}
                                        </button>
                                    ))}
                                </div>
                                
                                {isCustomTask && (
                                    <div className='p-2 border-t bg-gray-50'>
                                        <input
                                            type="text"
                                            placeholder="Enter custom task name..."
                                            value={customTaskName}
                                            onChange={(e) => setCustomTaskName(e.target.value)}
                                            className='w-full px-2 py-1 text-sm border rounded'
                                            autoFocus
                                        />
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Timer Display - Previous Dashboard Style */}
                    <div className='flex flex-col items-center py-4 gap-2'>
                        <p className='text-xs text-gray-500'>
                            {!isActive ? 'Awaiting' : isPaused ? 'Paused' : 'In Progress'}
                        </p>

                        <p className='text-gray-800 text-2xl font-semibold'>
                            {formatTime(time).split(':')[0]} :
                            {formatTime(time).split(':')[1]} :
                            <span className='text-gray-500'>
                                {formatTime(time).split(':')[2] || '00'}
                            </span>
                        </p>

                        <button 
                            onClick={!isActive ? handleStart : handlePause} 
                            className='text-primary relative text-xs flex font-medium items-center gap-1'
                        >
                            {!isActive ? (
                                <>
                                    <Play size={16} variant='Bold' />
                                    <span>Start Time Tracker</span>
                                </>
                            ) : isPaused ? (
                                <>
                                    <Play size={16} variant='Bold' />
                                    <span>Resume Time Tracker</span>
                                </>
                            ) : (
                                <>
                                    <Pause size={16} variant='Bold' />
                                    <span>Pause Time Tracker</span>
                                </>
                            )}
                        </button>

                        {isActive && (
                            <button 
                                onClick={handleStop} 
                                className='text-red-500 text-xs flex font-medium items-center gap-1 mt-1'
                            >
                                <Stop size={16} variant='Bold' />
                                <span>Stop & Save</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* previous tasks */}
                <div className='pt-3 flex-1 min-h-0 flex flex-col'>
                    <p className='text-xs text-gray-400 mb-3 flex-shrink-0'>Previous Tasks</p>
                    
                    <div className='flex-1 min-h-0'>
                        {sessions.length === 0 ? (
                            <div className='text-center py-4'>
                                <Archive size={24} className='mx-auto text-gray-300 mb-2' />
                                <p className='text-xs text-gray-500'>No sessions yet</p>
                            </div>
                        ) : (
                            /* tasks */
                            <div className='space-y-3 max-h-[200px] overflow-y-auto pr-1'>
                                {sessions.slice(0, 5).map((session, index) => (
                                    <motion.div
                                        key={session.id}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                        className='flex items-center justify-between'
                                    >
                                    <div className='flex gap-2'>
                                        <div className='rounded-full p-1.5 border border-gray-300 shrink-0'>
                                            <Timer1 size={16} className='text-primary' />
                                        </div>
                                        <div className='font-medium'>
                                            <p className='text-sm text-gray-800'>{session.projectName}</p>
                                        </div>
                                    </div>
                                    <button>
                                        <More size={20} className='text-gray-400' />
                                    </button>
                                </motion.div>
                            ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TimeTracker
