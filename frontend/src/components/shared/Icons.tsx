"use client"

import React, { Suspense } from 'react'
import dynamic from 'next/dynamic'

// Dynamic imports for all icons to ensure proper loading
const ArrowRight2 = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.ArrowRight2 })), { ssr: false })
const Calendar = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Calendar })), { ssr: false })
const Document = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Document })), { ssr: false })
const Element3 = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Element3 })), { ssr: false })
const Folder2 = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Folder2 })), { ssr: false })
const Headphone = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Headphone })), { ssr: false })
const Profile2User = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Profile2User })), { ssr: false })
const Setting2 = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Setting2 })), { ssr: false })
const Setting4 = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Setting4 })), { ssr: false })
const Star = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Star })), { ssr: false })
const Timer1 = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Timer1 })), { ssr: false })
const Triangle = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Triangle })), { ssr: false })
const Data = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Data })), { ssr: false })
const Activity = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Activity })), { ssr: false })
const DocumentUpload = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.DocumentUpload })), { ssr: false })
const Cpu = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Cpu })), { ssr: false })
const LogoutCurve = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.LogoutCurve })), { ssr: false })
const Shield = dynamic(() => import('iconsax-react').then(mod => ({ default: mod.Shield })), { ssr: false })

interface IconProps {
  size?: number
  color?: string
  variant?: 'Bold' | 'Outline' | 'Linear' | 'Broken' | 'TwoTone'
  className?: string
}

const IconWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<div className="w-4 h-4 bg-gray-300 rounded animate-pulse" />}>
    {children}
  </Suspense>
)

export const Icons = {
  ArrowRight2: (props: IconProps) => (
    <IconWrapper>
      <ArrowRight2 {...props} />
    </IconWrapper>
  ),
  Calendar: (props: IconProps) => (
    <IconWrapper>
      <Calendar {...props} />
    </IconWrapper>
  ),
  Document: (props: IconProps) => (
    <IconWrapper>
      <Document {...props} />
    </IconWrapper>
  ),
  Element3: (props: IconProps) => (
    <IconWrapper>
      <Element3 {...props} />
    </IconWrapper>
  ),
  Folder2: (props: IconProps) => (
    <IconWrapper>
      <Folder2 {...props} />
    </IconWrapper>
  ),
  Headphone: (props: IconProps) => (
    <IconWrapper>
      <Headphone {...props} />
    </IconWrapper>
  ),
  Profile2User: (props: IconProps) => (
    <IconWrapper>
      <Profile2User {...props} />
    </IconWrapper>
  ),
  Setting2: (props: IconProps) => (
    <IconWrapper>
      <Setting2 {...props} />
    </IconWrapper>
  ),
  Setting4: (props: IconProps) => (
    <IconWrapper>
      <Setting4 {...props} />
    </IconWrapper>
  ),
  Star: (props: IconProps) => (
    <IconWrapper>
      <Star {...props} />
    </IconWrapper>
  ),
  Timer1: (props: IconProps) => (
    <IconWrapper>
      <Timer1 {...props} />
    </IconWrapper>
  ),
  Triangle: (props: IconProps) => (
    <IconWrapper>
      <Triangle {...props} />
    </IconWrapper>
  ),
  Data: (props: IconProps) => (
    <IconWrapper>
      <Data {...props} />
    </IconWrapper>
  ),
  Activity: (props: IconProps) => (
    <IconWrapper>
      <Activity {...props} />
    </IconWrapper>
  ),
  DocumentUpload: (props: IconProps) => (
    <IconWrapper>
      <DocumentUpload {...props} />
    </IconWrapper>
  ),
  Cpu: (props: IconProps) => (
    <IconWrapper>
      <Cpu {...props} />
    </IconWrapper>
  ),
  LogoutCurve: (props: IconProps) => (
    <IconWrapper>
      <LogoutCurve {...props} />
    </IconWrapper>
  ),
  Shield: (props: IconProps) => (
    <IconWrapper>
      <Shield {...props} />
    </IconWrapper>
  ),
}
