"use client"

import React, { useState, useEffect } from 'react'
import { Add, Calendar2, NoteText, TickCircle, Edit2, Trash, Clock, Archive, RefreshCircle } from 'iconsax-react'
import { motion, AnimatePresence } from 'framer-motion'
import { firebaseService, type Note } from '@/services/firebaseService'

interface NewNoteForm {
    title: string
    content: string
    category: Note['category']
    priority: Note['priority']
    dueDate?: string
}

function Notes() {
    const [notes, setNotes] = useState<Note[]>([])
    const [showAddForm, setShowAddForm] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [lastSync, setLastSync] = useState<string>('')
    const [newNote, setNewNote] = useState<NewNoteForm>({
        title: '',
        content: '',
        category: 'personal',
        priority: 'medium'
    })

    const categoryColors = {
        personal: 'bg-blue-100 text-blue-600',
        work: 'bg-green-100 text-green-600',
        project: 'bg-purple-100 text-purple-600',
        meeting: 'bg-orange-100 text-orange-600',
        idea: 'bg-yellow-100 text-yellow-600'
    }

    const priorityColors = {
        low: 'bg-gray-100 text-gray-600',
        medium: 'bg-blue-100 text-blue-600',
        high: 'bg-red-100 text-red-600'
    }

    // Load notes from Firebase service
    useEffect(() => {
        loadNotes()
        
        // Subscribe to real-time updates using onNotesChange
        const unsubscribe = firebaseService.onNotesChange((updatedNotes) => {
            setNotes(updatedNotes)
            setLastSync(new Date().toLocaleTimeString())
        }, 'default')
        
        return () => unsubscribe()
    }, [])

    const loadNotes = async () => {
        setIsLoading(true)
        try {
            const firebaseNotes = await firebaseService.getNotes('default')
            setNotes(firebaseNotes)
            setLastSync(new Date().toLocaleTimeString())
        } catch (error) {
            console.error('Failed to load notes:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const saveNotesToFirebase = async (note: Note) => {
        try {
            await firebaseService.saveNote(note, 'default')
            setLastSync(new Date().toLocaleTimeString())
        } catch (error) {
            console.error('Failed to save note to Firebase:', error)
        }
    }

    const addNote = async () => {
        if (!newNote.title.trim()) return

        const note: Note = {
            id: Date.now().toString(),
            title: newNote.title,
            content: newNote.content,
            completed: false,
            category: newNote.category,
            priority: newNote.priority,
            createdAt: new Date(),
            updatedAt: new Date(),
            dueDate: newNote.dueDate ? new Date(newNote.dueDate) : undefined
        }

        // Save to Firebase - real-time listener will update local state
        await saveNotesToFirebase(note)

        // Reset form
        setNewNote({
            title: '',
            content: '',
            category: 'personal',
            priority: 'medium'
        })
        setShowAddForm(false)
    }

    const toggleNoteCompletion = async (noteId: string) => {
        const note = notes.find(n => n.id === noteId)
        if (!note) return

        // Update in Firebase - real-time listener will update local state
        await firebaseService.updateNote(noteId, { completed: !note.completed }, 'default')
    }

    const deleteNote = async (noteId: string) => {
        // Delete from Firebase - real-time listener will update local state
        await firebaseService.deleteNote(noteId, 'default')
    }

    const formatDate = (date: Date) => {
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        
        if (date.toDateString() === today.toDateString()) {
            return 'Today'
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday'
        } else {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
    }

    const getActiveTasks = () => notes.filter(note => !note.completed)
    const getCompletedTasks = () => notes.filter(note => note.completed)

    return (
        <div className='border text-gray-500 w-full p-3 rounded-2xl'>
            {/* header */}
            <div className='flex items-center justify-between'>
                <div className='flex items-center text-sm gap-2'>
                    <NoteText size={18} />
                    <p className='text-gray-800 font-medium'>Notes</p>
                    <span className='text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full'>
                        {getActiveTasks().length} active
                    </span>
                </div>
                <div className='flex items-center gap-2'>
                    <button 
                        onClick={loadNotes}
                        disabled={isLoading}
                        className='p-1 rounded hover:bg-gray-100 transition-colors'
                        title='Sync with Firebase'
                    >
                        <RefreshCircle 
                            size={14} 
                            className={`text-gray-500 ${isLoading ? 'animate-spin' : ''}`} 
                        />
                    </button>
                    <button 
                        onClick={() => setShowAddForm(!showAddForm)}
                        className='border flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:bg-gray-50 transition-colors'
                    >
                        <Add size={14} />
                        Add new
                    </button>
                </div>
            </div>

            <hr className='bg-gray-400 my-4' />

            {/* Add Note Form */}
            <AnimatePresence>
                {showAddForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className='mb-4 p-3 bg-gray-50 rounded-lg space-y-3'
                    >
                        <input
                            type="text"
                            placeholder="Note title..."
                            value={newNote.title}
                            onChange={(e) => setNewNote(prev => ({ ...prev, title: e.target.value }))}
                            className='w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary'
                        />
                        <textarea
                            placeholder="Note content..."
                            value={newNote.content}
                            onChange={(e) => setNewNote(prev => ({ ...prev, content: e.target.value }))}
                            className='w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none'
                            rows={3}
                        />
                        <div className='grid grid-cols-2 gap-3'>
                            <select
                                value={newNote.category}
                                onChange={(e) => setNewNote(prev => ({ ...prev, category: e.target.value as Note['category'] }))}
                                className='px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary'
                            >
                                <option value="personal">Personal</option>
                                <option value="work">Work</option>
                                <option value="project">Project</option>
                                <option value="meeting">Meeting</option>
                                <option value="idea">Idea</option>
                            </select>
                            <select
                                value={newNote.priority}
                                onChange={(e) => setNewNote(prev => ({ ...prev, priority: e.target.value as Note['priority'] }))}
                                className='px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary'
                            >
                                <option value="low">Low Priority</option>
                                <option value="medium">Medium Priority</option>
                                <option value="high">High Priority</option>
                            </select>
                        </div>
                        <input
                            type="date"
                            value={newNote.dueDate || ''}
                            onChange={(e) => setNewNote(prev => ({ ...prev, dueDate: e.target.value }))}
                            className='w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary'
                        />
                        <div className='flex gap-2'>
                            <button
                                onClick={addNote}
                                disabled={!newNote.title.trim()}
                                className='flex-1 bg-primary text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                Add Note
                            </button>
                            <button
                                onClick={() => setShowAddForm(false)}
                                className='px-3 py-2 border rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors'
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* content */}
            <div className='space-y-3'>
                {notes.length === 0 ? (
                    <div className='text-center py-8'>
                        <Archive size={32} className='mx-auto text-gray-300 mb-2' />
                        <p className='text-sm text-gray-500'>No notes yet</p>
                        <p className='text-xs text-gray-400'>Create your first note to get started</p>
                    </div>
                ) : (
                    <>
                        {/* Active Tasks */}
                        {getActiveTasks().map((note, index) => (
                            <motion.div
                                key={note.id}
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className='flex items-start gap-3 w-full'
                            >
                                <button 
                                    onClick={() => toggleNoteCompletion(note.id)}
                                    className='w-4 shrink-0 mt-1 h-4 border-2 border-gray-300 rounded-full hover:border-green-500 transition-colors'
                                />
                                <div className='w-full space-y-1'>
                                    <p className='text-sm text-gray-800 font-medium'>{note.title}</p>
                                    {note.content && (
                                        <p className='text-xs text-gray-600'>{note.content}</p>
                                    )}
                                    <div className='flex justify-between items-end'>
                                        <div className='space-x-1 font-medium'>
                                            <span className={`text-xxs px-2 py-0.5 rounded-full capitalize ${categoryColors[note.category]}`}>
                                                {note.category}
                                            </span>
                                            <span className={`text-xxs px-2 py-0.5 rounded-full capitalize ${priorityColors[note.priority]}`}>
                                                {note.priority}
                                            </span>
                                            {note.dueDate && (
                                                <span className='text-xxs px-2 py-0.5 rounded-full bg-red-100 text-red-600'>
                                                    Due: {formatDate(note.dueDate)}
                                                </span>
                                            )}
                                        </div>
                                        <div className='flex items-center gap-2'>
                                            <p className='flex items-center gap-1 text-xxs text-gray-500'>
                                                <Calendar2 size={12} />
                                                {formatDate(note.createdAt)}
                                            </p>
                                            <button
                                                onClick={() => deleteNote(note.id)}
                                                className='p-1 hover:bg-red-100 rounded transition-colors'
                                                title='Delete note'
                                            >
                                                <Trash size={12} className='text-red-500' />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}

                        {/* Completed Tasks */}
                        {getCompletedTasks().length > 0 && (
                            <>
                                {getActiveTasks().length > 0 && <hr className='bg-gray-400' />}
                                <div className='space-y-3'>
                                    <p className='text-xs text-gray-400 font-medium'>Completed ({getCompletedTasks().length})</p>
                                    {getCompletedTasks().slice(0, 3).map((note, index) => (
                                        <motion.div
                                            key={note.id}
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.1 }}
                                            className='flex items-start gap-3 w-full opacity-60'
                                        >
                                            <TickCircle 
                                                size={18} 
                                                variant='Bold' 
                                                className='text-green-500 mt-0.5 cursor-pointer'
                                                onClick={() => toggleNoteCompletion(note.id)}
                                            />
                                            <div className='w-full space-y-1'>
                                                <p className='text-sm text-gray-800 font-medium line-through'>{note.title}</p>
                                                {note.content && (
                                                    <p className='text-xs text-gray-600 line-through'>{note.content}</p>
                                                )}
                                                <div className='flex justify-between items-end'>
                                                    <div className='space-x-1 font-medium'>
                                                        <span className={`text-xxs px-2 py-0.5 rounded-full capitalize ${categoryColors[note.category]}`}>
                                                            {note.category}
                                                        </span>
                                                    </div>
                                                    <div className='flex items-center gap-2'>
                                                        <p className='flex items-center gap-1 text-xxs text-gray-500'>
                                                            <TickCircle size={12} />
                                                            Completed
                                                        </p>
                                                        <button
                                                            onClick={() => deleteNote(note.id)}
                                                            className='p-1 hover:bg-red-100 rounded transition-colors'
                                                            title='Delete note'
                                                        >
                                                            <Trash size={12} className='text-red-500' />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* Sync Status */}
                {lastSync && (
                    <div className='text-center pt-2 border-t border-gray-200'>
                        <p className='text-xxs text-gray-400 flex items-center justify-center gap-1'>
                            <Clock size={10} />
                            Last synced: {lastSync}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default Notes