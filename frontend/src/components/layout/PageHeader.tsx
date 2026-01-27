'use client';

import React from 'react';
import PageNavbar, { 
    PageNavbarLeftContent, 
    PageNavbarRightContent, 
    PageNavbarIconButton,
    PageNavbarPrimaryButton
} from '@/components/layout/PageNavbar';
import { Cpu, SearchNormal1, DirectNotification, DocumentUpload, Add, Refresh, ArrowLeft } from 'iconsax-react';
import Link from 'next/link';
import { OutlineButton } from '@/components/ui/Button';

interface PageHeaderProps {
    title?: string;
    subtitle?: string;
    icon?: any;
    children?: React.ReactNode;
    onRefresh?: () => void;
    refreshing?: boolean;
    hideSearch?: boolean;
    hideNotification?: boolean;
    backUrl?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ 
    title = "Shopple Admin", 
    subtitle, 
    icon: Icon = Cpu, 
    children, 
    onRefresh, 
    refreshing,
    hideSearch = false,
    hideNotification = false,
    backUrl
}) => {
    return (
        <PageNavbar>
            <PageNavbarLeftContent>
                <div className='flex items-center gap-3'>
                    {backUrl && (
                        <Link href={backUrl}>
                            <PageNavbarIconButton className='mr-1'>
                                <ArrowLeft size={20} className="text-gray-500" />
                            </PageNavbarIconButton>
                        </Link>
                    )}
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 text-indigo-600">
                        <Icon size={22} variant="Bulk" />
                    </div>
                    <div>
                        <p className='text-sm font-bold text-gray-900'>{title}</p>
                        {subtitle && <p className='text-xs font-medium text-gray-500'>{subtitle}</p>}
                    </div>
                </div>
            </PageNavbarLeftContent>

            <PageNavbarRightContent>
                {onRefresh && (
                    <PageNavbarIconButton 
                        className='all-center h-9 w-9 duration-200 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-indigo-600'
                        onClick={onRefresh}
                        disabled={refreshing}
                        title="Refresh data"
                    >
                        <Refresh size={18} className={refreshing ? 'animate-spin' : ''} />
                    </PageNavbarIconButton>
                )}

                {!hideSearch && (
                    <PageNavbarIconButton className='all-center h-9 w-9 duration-200 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-indigo-600'>
                        <SearchNormal1 size={18} />
                    </PageNavbarIconButton>
                )}

                {!hideNotification && (
                    <PageNavbarIconButton className='all-center h-9 w-9 duration-200 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-indigo-600'>
                        <DirectNotification size={18} />
                    </PageNavbarIconButton>
                )}
                
                {children}
            </PageNavbarRightContent>
        </PageNavbar>
    );
};
