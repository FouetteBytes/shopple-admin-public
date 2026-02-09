// Firebase service for Notes and other data operations
// Real Firebase Firestore integration for client-side

import { 
    collection, 
    doc, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    onSnapshot, 
    query, 
    orderBy, 
    serverTimestamp,
    Timestamp
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '@/lib/firebase'

interface Note {
    id: string
    title: string
    content: string
    completed: boolean
    category: 'personal' | 'work' | 'project' | 'meeting' | 'idea'
    priority: 'low' | 'medium' | 'high'
    createdAt: Date
    updatedAt: Date
    dueDate?: Date
    userId?: string
}

class FirebaseService {
    private static instance: FirebaseService
    private operationsCount = {
        reads: 0,
        writes: 0,
        updates: 0
    }
    private static configWarningShown = false

    static getInstance(): FirebaseService {
        if (!FirebaseService.instance) {
            FirebaseService.instance = new FirebaseService()
        }
        return FirebaseService.instance
    }

    // Check if Firebase is available and show warning once if not
    private checkFirebaseAvailable(): boolean {
        if (!isFirebaseConfigured()) {
            if (!FirebaseService.configWarningShown) {
                console.warn('[FirebaseService] Firebase client is not configured. Notes features will not work.')
                FirebaseService.configWarningShown = true
            }
            return false
        }
        return true
    }

    // Convert Firestore timestamp to Date
    private timestampToDate(timestamp: any): Date {
        if (timestamp && timestamp.toDate) {
            return timestamp.toDate()
        }
        if (timestamp && typeof timestamp === 'string') {
            return new Date(timestamp)
        }
        return new Date()
    }

    // Get notes collection reference for a user
    private getNotesCollection(userId: string = 'default') {
        return collection(db, 'users', userId, 'notes')
    }

    // Fetch notes from Firebase Firestore
    async getNotes(userId: string = 'default'): Promise<Note[]> {
        if (!this.checkFirebaseAvailable()) {
            return []
        }
        
        this.operationsCount.reads++
        
        try {
            const notesRef = this.getNotesCollection(userId)
            const q = query(notesRef, orderBy('createdAt', 'desc'))
            const querySnapshot = await getDocs(q)
            
            const notes: Note[] = []
            querySnapshot.forEach((doc) => {
                const data = doc.data()
                notes.push({
                    id: doc.id,
                    title: data.title || '',
                    content: data.content || '',
                    completed: data.completed || false,
                    category: data.category || 'personal',
                    priority: data.priority || 'medium',
                    createdAt: this.timestampToDate(data.createdAt),
                    updatedAt: this.timestampToDate(data.updatedAt),
                    dueDate: data.dueDate ? this.timestampToDate(data.dueDate) : undefined
                })
            })
            
            console.log(`[Firebase] Retrieved ${notes.length} notes for user ${userId}`)
            return notes
        } catch (error) {
            console.error('Failed to fetch notes from Firebase:', error)
            return []
        }
    }

    async saveNote(note: Note, userId: string = 'default'): Promise<boolean> {
        if (!this.checkFirebaseAvailable()) {
            return false
        }
        
        this.operationsCount.writes++
        
        try {
            const notesRef = this.getNotesCollection(userId)
            
            const noteData = {
                title: note.title,
                content: note.content,
                completed: note.completed,
                category: note.category,
                priority: note.priority,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                dueDate: note.dueDate ? Timestamp.fromDate(note.dueDate) : null
            }
            
            const docRef = await addDoc(notesRef, noteData)
            console.log(`[Firebase] Saved note ${docRef.id} for user ${userId}`)
            return true
        } catch (error) {
            console.error('Failed to save note to Firebase:', error)
            return false
        }
    }

    async updateNote(noteId: string, updates: Partial<Note>, userId: string = 'default'): Promise<boolean> {
        if (!this.checkFirebaseAvailable()) {
            return false
        }
        
        this.operationsCount.updates++
        
        try {
            const noteRef = doc(db, 'users', userId, 'notes', noteId)
            
            const updateData: any = {
                ...updates,
                updatedAt: serverTimestamp()
            }
            
            // Handle date conversion for dueDate
            if (updateData.dueDate) {
                updateData.dueDate = Timestamp.fromDate(updateData.dueDate)
            }
            
            // Remove id field to prevent conflicts
            delete updateData.id
            delete updateData.createdAt // Don't update createdAt
            
            await updateDoc(noteRef, updateData)
            console.log(`[Firebase] Updated note ${noteId} for user ${userId}`)
            return true
        } catch (error) {
            console.error('Failed to update note in Firebase:', error)
            return false
        }
    }

    async deleteNote(noteId: string, userId: string = 'default'): Promise<boolean> {
        if (!this.checkFirebaseAvailable()) {
            return false
        }
        
        this.operationsCount.writes++
        
        try {
            const noteRef = doc(db, 'users', userId, 'notes', noteId)
            await deleteDoc(noteRef)
            console.log(`[Firebase] Deleted note ${noteId} for user ${userId}`)
            return true
        } catch (error) {
            console.error('Failed to delete note from Firebase:', error)
            return false
        }
    }

    // Real-time listener for notes updates
    onNotesChange(callback: (notes: Note[]) => void, userId: string = 'default'): () => void {
        if (!this.checkFirebaseAvailable()) {
            // Return a no-op unsubscribe function
            return () => {}
        }
        
        this.operationsCount.reads++
        
        try {
            const notesRef = this.getNotesCollection(userId)
            const q = query(notesRef, orderBy('createdAt', 'desc'))
            
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
                const notes: Note[] = []
                querySnapshot.forEach((doc) => {
                    const data = doc.data()
                    notes.push({
                        id: doc.id,
                        title: data.title || '',
                        content: data.content || '',
                        completed: data.completed || false,
                        category: data.category || 'personal',
                        priority: data.priority || 'medium',
                        createdAt: this.timestampToDate(data.createdAt),
                        updatedAt: this.timestampToDate(data.updatedAt),
                        dueDate: data.dueDate ? this.timestampToDate(data.dueDate) : undefined
                    })
                })
                
                console.log(`[Firebase] Real-time update: ${notes.length} notes for user ${userId}`)
                callback(notes)
            }, (error) => {
                console.error('Firebase listener error:', error)
                callback([])
            })
            
            return unsubscribe
        } catch (error) {
            console.error('Failed to setup Firebase listener:', error)
            return () => {}
        }
    }

    // Analytics for Firebase operations
    getOperationsStats() {
        return {
            ...this.operationsCount,
            total: this.operationsCount.reads + this.operationsCount.writes + this.operationsCount.updates
        }
    }

    // Reset operation counters
    resetStats() {
        this.operationsCount = {
            reads: 0,
            writes: 0,
            updates: 0
        }
    }

    // Utility function to create a new note with proper structure
    createNote(
        title: string, 
        content: string, 
        category: Note['category'] = 'personal',
        priority: Note['priority'] = 'medium',
        dueDate?: Date
    ): Omit<Note, 'id' | 'createdAt' | 'updatedAt'> {
        return {
            title,
            content,
            completed: false,
            category,
            priority,
            dueDate
        }
    }

    // Bulk operations for better performance
    async bulkDeleteNotes(noteIds: string[], userId: string = 'default'): Promise<boolean> {
        try {
            const deletePromises = noteIds.map(id => this.deleteNote(id, userId))
            const results = await Promise.all(deletePromises)
            return results.every(result => result)
        } catch (error) {
            console.error('Failed to bulk delete notes:', error)
            return false
        }
    }

    async bulkUpdateNotes(updates: Array<{id: string, data: Partial<Note>}>, userId: string = 'default'): Promise<boolean> {
        try {
            const updatePromises = updates.map(update => this.updateNote(update.id, update.data, userId))
            const results = await Promise.all(updatePromises)
            return results.every(result => result)
        } catch (error) {
            console.error('Failed to bulk update notes:', error)
            return false
        }
    }
}

export const firebaseService = FirebaseService.getInstance()
export default firebaseService
export type { Note }
