"use client"

import { useState } from 'react'
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore'
import app, { isFirebaseConfigured } from '@/lib/firebase'

export default function PopulateFirebaseData() {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const populateData = async () => {
    if (!isFirebaseConfigured()) {
      setStatus('Error: Firebase is not configured. Please check your environment variables.')
      return
    }
    
    setLoading(true)
    setStatus('Starting data population...')
    
    try {
      const db = getFirestore(app)
      
      // Add some sample notes
      const notesData = [
        { title: 'Welcome Note', content: 'Welcome to the system!', completed: false, category: 'work', priority: 'high', createdAt: new Date(), updatedAt: new Date() },
        { title: 'Test Note', content: 'This is a test note', completed: true, category: 'personal', priority: 'medium', createdAt: new Date(), updatedAt: new Date() },
        { title: 'Project Ideas', content: 'Brainstorming new features', completed: false, category: 'project', priority: 'low', createdAt: new Date(), updatedAt: new Date() }
      ]
      
      setStatus('Adding notes...')
      for (const note of notesData) {
        await addDoc(collection(db, 'notes'), note)
      }
      
      // Add some sample users
      const usersData = [
        { name: 'Admin User', email: 'admin@example.com', role: 'admin', createdAt: new Date() },
        { name: 'Test User', email: 'user@example.com', role: 'user', createdAt: new Date() }
      ]
      
      setStatus('Adding users...')
      for (const user of usersData) {
        await addDoc(collection(db, 'users'), user)
      }
      
      // Add some sample activities
      const activitiesData = [
        { type: 'login', user: 'admin@example.com', timestamp: new Date(), details: 'User logged in' },
        { type: 'classification', user: 'admin@example.com', timestamp: new Date(), details: 'Classified 10 products' },
        { type: 'crawler', user: 'system', timestamp: new Date(), details: 'Crawler finished successfully' }
      ]
      
      setStatus('Adding activities...')
      for (const activity of activitiesData) {
        await addDoc(collection(db, 'activities'), activity)
      }
      
      // Add some sample logs
      const logsData = [
        { level: 'info', message: 'System started', timestamp: new Date(), component: 'system' },
        { level: 'warning', message: 'Cache miss for product XYZ', timestamp: new Date(), component: 'cache' },
        { level: 'error', message: 'Failed to connect to external API', timestamp: new Date(), component: 'api' }
      ]
      
      setStatus('Adding logs...')
      for (const log of logsData) {
        await addDoc(collection(db, 'logs'), log)
      }
      
      setStatus('Data population completed successfully! ✅')
      
    } catch (error: any) {
      setStatus(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Populate Firebase Test Data</h1>
      
      <div className="bg-white rounded-lg border p-6">
        <p className="text-gray-600 mb-4">
          This will add sample data to Firebase collections to test the dashboard functionality.
        </p>
        
        <button
          onClick={populateData}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Populating...' : 'Populate Test Data'}
        </button>
        
        {status && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm">{status}</p>
          </div>
        )}
      </div>
    </div>
  )
}
