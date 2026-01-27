"use client"

import { useCentralStore } from '@/Store'
import { PageHeader } from '@/components/layout/PageHeader';
import PageNavbar, { PageNavbarIconButton, PageNavbarLeftContent, PageNavbarRightContent } from '@/components/layout/PageNavbar'
import { MessageQuestion, ArrowLeft, Call, Sms, Book1, DocumentText, Video, InfoCircle } from 'iconsax-react'
import PageContent from '@/components/layout/PageContent'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { OutlineButton } from '@/components/ui/Button'
import Link from 'next/link'
import { GlassSubTabs } from '@/components/shared/GlassSubTabs'
import { GlassFilterBar, type GlassFilterSelectConfig, type GlassFilterOption } from '@/components/shared/GlassFilterBar'
import { PageHero } from '@/components/shared/PageHero'

interface SupportTicket {
    id: string
    subject: string
    status: 'open' | 'in-progress' | 'resolved'
    priority: 'low' | 'medium' | 'high'
    createdAt: Date
}

type SupportTabKey = 'help' | 'tickets' | 'contact' | 'resources'

function Support() {
    const [activeTab, setActiveTab] = useState<SupportTabKey>('help')
    const [tickets] = useState<SupportTicket[]>([
        {
            id: '1',
            subject: 'AI Model Configuration Issue',
            status: 'in-progress',
            priority: 'high',
            createdAt: new Date(Date.now() - 86400000)
        },
        {
            id: '2',
            subject: 'Cache Optimization Question',
            status: 'resolved',
            priority: 'medium',
            createdAt: new Date(Date.now() - 172800000)
        }
    ])

    const [ticketSearch, setTicketSearch] = useState('')
    const [ticketStatusFilter, setTicketStatusFilter] = useState<'all' | SupportTicket['status']>('all')
    const [ticketPriorityFilter, setTicketPriorityFilter] = useState<'all' | SupportTicket['priority']>('all')
    const [ticketAutoRefresh, setTicketAutoRefresh] = useState(true)
    const [lastTicketRefresh, setLastTicketRefresh] = useState<Date | null>(null)

    const handleTicketRefresh = useCallback(() => {
        setLastTicketRefresh(new Date())
    }, [])

    useEffect(() => {
        handleTicketRefresh()
    }, [handleTicketRefresh])

    useEffect(() => {
        if (!ticketAutoRefresh) return
        const id = setInterval(() => {
            handleTicketRefresh()
        }, 60000)
        return () => clearInterval(id)
    }, [ticketAutoRefresh, handleTicketRefresh])

    const [newTicket, setNewTicket] = useState({
        subject: '',
        description: '',
        priority: 'medium' as const
    })

    const handleSubmitTicket = async () => {
        if (!newTicket.subject.trim()) return
        
        // Here you would normally submit to backend
        console.log('Submitting ticket:', newTicket)
        
        // Reset form
        setNewTicket({
            subject: '',
            description: '',
            priority: 'medium'
        })
    }

    const filteredTickets = useMemo(() => {
        const query = ticketSearch.trim().toLowerCase()
        return tickets.filter(ticket => {
            const matchesSearch = !query ||
                ticket.subject.toLowerCase().includes(query) ||
                ticket.status.toLowerCase().includes(query)
            const matchesStatus = ticketStatusFilter === 'all' || ticket.status === ticketStatusFilter
            const matchesPriority = ticketPriorityFilter === 'all' || ticket.priority === ticketPriorityFilter
            return matchesSearch && matchesStatus && matchesPriority
        })
    }, [tickets, ticketSearch, ticketStatusFilter, ticketPriorityFilter])

    const ticketStats = useMemo(() => {
        const openCount = tickets.filter(ticket => ticket.status === 'open').length
        const inProgressCount = tickets.filter(ticket => ticket.status === 'in-progress').length
        const resolvedCount = tickets.filter(ticket => ticket.status === 'resolved').length
        const highPriority = tickets.filter(ticket => ticket.priority === 'high').length
        return [
            {
                label: 'Open tickets',
                value: openCount.toString(),
                subtext: 'Need triage',
                color: 'amber'
            },
            {
                label: 'In progress',
                value: inProgressCount.toString(),
                subtext: 'Actively being handled',
                color: 'indigo'
            },
            {
                label: 'Resolved',
                value: resolvedCount.toString(),
                subtext: 'Closed within SLA',
                color: 'emerald'
            },
            {
                label: 'High priority',
                value: highPriority.toString(),
                subtext: 'Escalated alerts',
                color: 'rose'
            }
        ]
    }, [tickets])

    const supportTabs = useMemo(() => [
        {
            key: 'help' as const,
            label: 'Help Center',
            description: 'Guides and tutorials',
            icon: Book1,
            accentGradient: 'bg-gradient-to-br from-sky-500/15 via-white to-transparent'
        },
        {
            key: 'tickets' as const,
            label: 'Support Tickets',
            description: `${filteredTickets.length} matching records`,
            icon: MessageQuestion,
            accentGradient: 'bg-gradient-to-br from-indigo-500/15 via-white to-transparent',
            badgeValue: tickets.length,
            badgeClassName: 'bg-primary'
        },
        {
            key: 'contact' as const,
            label: 'Contact Us',
            description: 'Escalate directly to support',
            icon: Call,
            accentGradient: 'bg-gradient-to-br from-emerald-500/15 via-white to-transparent'
        },
        {
            key: 'resources' as const,
            label: 'Resources',
            description: 'API docs & tutorials',
            icon: DocumentText,
            accentGradient: 'bg-gradient-to-br from-amber-500/15 via-white to-transparent'
        }
    ], [filteredTickets.length, tickets.length])

    const statusOptions: GlassFilterOption[] = [
        { value: 'all', label: 'All statuses' },
        { value: 'open', label: 'Open' },
        { value: 'in-progress', label: 'In progress' },
        { value: 'resolved', label: 'Resolved' }
    ]

    const priorityOptions: GlassFilterOption[] = [
        { value: 'all', label: 'All priorities' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' }
    ]

    const ticketFilterSelects: GlassFilterSelectConfig[] = [
        {
            label: 'Status',
            value: ticketStatusFilter,
            options: statusOptions,
            onChange: (value) => setTicketStatusFilter(value as 'all' | SupportTicket['status'])
        },
        {
            label: 'Priority',
            value: ticketPriorityFilter,
            options: priorityOptions,
            onChange: (value) => setTicketPriorityFilter(value as 'all' | SupportTicket['priority'])
        }
    ]

    const helpArticles = [
        {
            title: 'Getting Started with AI Classification',
            description: 'Learn how to set up and use the AI product classifier',
            category: 'Basics',
            readTime: '5 min'
        },
        {
            title: 'Configuring AI Models',
            description: 'Guide to setting up different AI model providers',
            category: 'Configuration',
            readTime: '8 min'
        },
        {
            title: 'Cache Optimization Best Practices',
            description: 'How to optimize cache performance for better results',
            category: 'Performance',
            readTime: '6 min'
        },
        {
            title: 'Troubleshooting Common Issues',
            description: 'Solutions to frequently encountered problems',
            category: 'Troubleshooting',
            readTime: '10 min'
        }
    ]

    const resources = [
        {
            title: 'API Documentation',
            description: 'Complete API reference and examples',
            icon: DocumentText,
            link: '#'
        },
        {
            title: 'Video Tutorials',
            description: 'Step-by-step video guides',
            icon: Video,
            link: '#'
        },
        {
            title: 'System Status',
            description: 'Check current system health and uptime',
            icon: InfoCircle,
            link: '#'
        }
    ]

    return (
        <div>

            <PageHeader 
                title="Support Center" 
                backUrl="/app/dashboard"
                icon={MessageQuestion}
                hideSearch={true}
                hideNotification={true}
            >
                <OutlineButton className='h-8 gap-1 border py-1 px-3 duration-200 hover:bg-gray-100 rounded-lg text-xs flex items-center justify-center'>
                    <Call size={16} />
                    <span>Emergency Support</span>
                </OutlineButton>
            </PageHeader>

            <PageContent>
                <div className='max-w-6xl mx-auto'>
                    <PageHero
                        title="Support Center"
                        description="Get help and resources for the AI Product Classifier"
                        stats={ticketStats}
                    />

                    {/* Tab Navigation */}
                    <div className='mb-6'>
                        <GlassSubTabs
                            tabs={supportTabs}
                            activeKey={activeTab}
                            onChange={(key) => setActiveTab(key)}
                            layoutId='support-center-tabs'
                            columnsClassName='grid-cols-1 md:grid-cols-2'
                        />
                    </div>

                    {/* Help Center */}
                    {activeTab === 'help' && (
                        <div className='space-y-6'>
                            <div className='text-center py-8'>
                                <h2 className='text-2xl font-bold text-gray-900 mb-4'>How can we help you?</h2>
                                <div className='max-w-md mx-auto'>
                                    <div className='relative'>
                                        <input
                                            type="text"
                                            placeholder="Search help articles..."
                                            className='w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                                        />
                                        <MessageQuestion size={20} className='absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
                                    </div>
                                </div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                                {helpArticles.map((article, index) => (
                                    <div key={index} className='bg-white border rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer'>
                                        <div className='flex items-start justify-between mb-3'>
                                            <span className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800'>
                                                {article.category}
                                            </span>
                                            <span className='text-xs text-gray-500'>{article.readTime}</span>
                                        </div>
                                        <h3 className='text-lg font-medium text-gray-900 mb-2'>{article.title}</h3>
                                        <p className='text-gray-600 text-sm'>{article.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Support Tickets */}
                    {activeTab === 'tickets' && (
                        <div className='space-y-6'>
                            <div className='flex justify-between items-center'>
                                <h2 className='text-xl font-bold text-gray-900'>Your Support Tickets</h2>
                                <button className='bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors'>
                                    Create New Ticket
                                </button>
                            </div>

                            <GlassFilterBar
                                searchPlaceholder='Search tickets by subject or status'
                                searchValue={ticketSearch}
                                onSearchChange={setTicketSearch}
                                selects={ticketFilterSelects}
                                onRefresh={handleTicketRefresh}
                                autoRefresh={ticketAutoRefresh}
                                onAutoRefreshChange={setTicketAutoRefresh}
                                lastRefreshedLabel={lastTicketRefresh ? lastTicketRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null}
                            />

                            {/* New Ticket Form */}
                            <div className='bg-white border rounded-lg p-6'>
                                <h3 className='text-lg font-medium text-gray-900 mb-4'>Create Support Ticket</h3>
                                <div className='space-y-4'>
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>Subject</label>
                                        <input
                                            type="text"
                                            value={newTicket.subject}
                                            onChange={(e) => setNewTicket(prev => ({ ...prev, subject: e.target.value }))}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                            placeholder="Brief description of your issue"
                                        />
                                    </div>
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>Description</label>
                                        <textarea
                                            rows={4}
                                            value={newTicket.description}
                                            onChange={(e) => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                            placeholder="Detailed description of your issue"
                                        />
                                    </div>
                                    <div>
                                        <label className='block text-sm font-medium text-gray-700 mb-2'>Priority</label>
                                        <select
                                            value={newTicket.priority}
                                            onChange={(e) => setNewTicket(prev => ({ ...prev, priority: e.target.value as any }))}
                                            className='w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500'
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={handleSubmitTicket}
                                        className='bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors'
                                    >
                                        Submit Ticket
                                    </button>
                                </div>
                            </div>

                            {/* Existing Tickets */}
                            <div className='space-y-4'>
                                {filteredTickets.length === 0 ? (
                                    <div className='rounded-lg border border-dashed border-gray-200 bg-white/60 p-6 text-center text-sm text-gray-500'>
                                        No tickets match your filters.
                                    </div>
                                ) : (
                                    filteredTickets.map((ticket) => (
                                    <div key={ticket.id} className='bg-white border rounded-lg p-4'>
                                        <div className='flex items-center justify-between mb-2'>
                                            <h4 className='font-medium text-gray-900'>{ticket.subject}</h4>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                ticket.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                                ticket.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                                {ticket.status.replace('-', ' ')}
                                            </span>
                                        </div>
                                        <div className='flex items-center gap-4 text-sm text-gray-500'>
                                            <span>Ticket #{ticket.id}</span>
                                            <span>Priority: {ticket.priority}</span>
                                            <span>Created: {ticket.createdAt.toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Contact Us */}
                    {activeTab === 'contact' && (
                        <div className='space-y-6'>
                            <div className='text-center py-8'>
                                <h2 className='text-2xl font-bold text-gray-900 mb-4'>Get in Touch</h2>
                                <p className='text-gray-600 max-w-2xl mx-auto'>
                                    Have a question or need immediate assistance? Our support team is here to help.
                                </p>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                                <div className='bg-white border rounded-lg p-6 text-center'>
                                    <Call size={40} className='mx-auto text-blue-600 mb-4' />
                                    <h3 className='text-lg font-medium text-gray-900 mb-2'>Phone Support</h3>
                                    <p className='text-gray-600 mb-4'>24/7 emergency support</p>
                                    <p className='text-blue-600 font-medium'>+1 (555) 123-4567</p>
                                </div>

                                <div className='bg-white border rounded-lg p-6 text-center'>
                                    <Sms size={40} className='mx-auto text-green-600 mb-4' />
                                    <h3 className='text-lg font-medium text-gray-900 mb-2'>Email Support</h3>
                                    <p className='text-gray-600 mb-4'>Response within 24 hours</p>
                                    <p className='text-green-600 font-medium'>support@aiclassifier.com</p>
                                </div>

                                <div className='bg-white border rounded-lg p-6 text-center'>
                                    <MessageQuestion size={40} className='mx-auto text-purple-600 mb-4' />
                                    <h3 className='text-lg font-medium text-gray-900 mb-2'>Live Chat</h3>
                                    <p className='text-gray-600 mb-4'>Instant help online</p>
                                    <button className='text-purple-600 font-medium hover:underline'>Start Chat</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Resources */}
                    {activeTab === 'resources' && (
                        <div className='space-y-6'>
                            <div className='text-center py-8'>
                                <h2 className='text-2xl font-bold text-gray-900 mb-4'>Resources & Documentation</h2>
                                <p className='text-gray-600 max-w-2xl mx-auto'>
                                    Everything you need to get the most out of the AI Product Classifier.
                                </p>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
                                {resources.map((resource, index) => (
                                    <div key={index} className='bg-white border rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer'>
                                        <resource.icon size={40} className='text-blue-600 mb-4' />
                                        <h3 className='text-lg font-medium text-gray-900 mb-2'>{resource.title}</h3>
                                        <p className='text-gray-600 mb-4'>{resource.description}</p>
                                        <button className='text-blue-600 font-medium hover:underline'>
                                            Learn More →
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Quick Links */}
                            <div className='bg-gray-50 rounded-lg p-6'>
                                <h3 className='text-lg font-medium text-gray-900 mb-4'>Quick Links</h3>
                                <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                                    <Link href="/app/settings" className='text-blue-600 hover:underline text-sm'>
                                        System Settings
                                    </Link>
                                    <Link href="/app/dashboard" className='text-blue-600 hover:underline text-sm'>
                                        Dashboard
                                    </Link>
                                    <Link href="/app/classifier" className='text-blue-600 hover:underline text-sm'>
                                        AI Classifier
                                    </Link>
                                    <Link href="/app/cache" className='text-blue-600 hover:underline text-sm'>
                                        Cache Management
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </PageContent>
        </div>
    )
}

export default Support
