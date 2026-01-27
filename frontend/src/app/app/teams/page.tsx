"use client"

import { Add, ExportCurve, Notification, SearchNormal1, People } from 'iconsax-react'
import PageContent from '@/components/layout/PageContent'
import { PrimaryButton, OutlineButton } from '@/components/ui/Button'
import { PageHero } from '@/components/shared/PageHero'
import MembersTable from '@/components/teams/MembersTable'
import { PageHeader } from '@/components/layout/PageHeader'

function Teams() {

    return (
        <div className='text-gray-500 w-full'>
            <PageHeader 
                title="Team Members" 
                subtitle="Manage access and roles" 
                icon={People}
            />
            <PageContent>
                <PageHero
                    title="Team Members"
                    description="Display all the team members and essential details"
                    badges={
                        <div className='flex gap-2'>
                            <OutlineButton>
                                <ExportCurve size={16} />
                                <span className='hidden md:block'>
                                    Export
                                </span>
                            </OutlineButton>
                            <PrimaryButton>
                                <Add size={16} />
                                Invite member
                            </PrimaryButton>
                        </div>
                    }
                >
                    <div className="flex items-center gap-2">
                        <button className='all-center h-10 w-10 duration-200 hover:bg-gray-100 rounded-xl'>
                            <SearchNormal1 size={16} />
                        </button>
                        <button className='all-center h-10 w-10 duration-200 hover:bg-gray-100 rounded-xl'>
                            <Notification size={16} />
                        </button>
                    </div>
                </PageHero>


                {/* members table */}
                <MembersTable />

            </PageContent>

        </div>
    )
}

export default Teams