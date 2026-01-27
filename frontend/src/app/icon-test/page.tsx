import React from 'react'
import { Cpu, Activity, Calendar, Document } from 'iconsax-react'

export default function IconTest() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Icon Test</h1>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <Cpu size={24} />
        <Activity size={24} />
        <Calendar size={24} />
        <Document size={24} />
        <span>If you can see icons before this text, they are working!</span>
      </div>
    </div>
  )
}
