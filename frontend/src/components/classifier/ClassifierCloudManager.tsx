import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { classificationAPI } from '@/lib/api'
import { formatDateTime, fromDatetimeLocalInput, toDatetimeLocalInput } from '@/utils/datetime'
import { formatFileSize } from '@/utils/files'
import type { ClassificationCloudFile } from '@/types/classification'

interface MetadataEditorState {
  cloudPath: string
  filename: string
  supermarket: string
  customName: string
  classificationDate: string
}

const ClassifierCloudManager: React.FC = () => {
  const [files, setFiles] = useState<ClassificationCloudFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [supermarketFilter, setSupermarketFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'recent' | 'alphabetical'>('recent')
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [metadataEditor, setMetadataEditor] = useState<MetadataEditorState | null>(null)

  const uniqueSupermarkets = useMemo(() => {
    const entries = new Set<string>()
    files.forEach((file) => {
      if (file.supermarket) {
        entries.add(file.supermarket)
      }
    })
    return Array.from(entries).sort((a, b) => a.localeCompare(b))
  }, [files])

  const totalSize = useMemo(() => {
    const bytes = files.reduce((sum, file) => sum + (file.size || 0), 0)
    return formatFileSize(bytes)
  }, [files])

  const isBusy = useCallback(
    (action: 'download' | 'delete' | 'update', cloudPath: string) => actionKey === `${action}:${cloudPath}`,
    [actionKey],
  )

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await classificationAPI.listCloudResults()
      if (response?.success) {
        setFiles(response.files || [])
      } else {
        setFiles(response?.files || [])
        setError(response?.error || 'Failed to load cloud files')
      }
    } catch (err: any) {
      console.error('Failed to load cloud results:', err)
      setError(err?.message || 'Failed to load cloud files')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  useEffect(() => {
    const handler = () => {
      loadFiles()
    }
    window.addEventListener('classification-cloud-updated', handler)
    return () => window.removeEventListener('classification-cloud-updated', handler)
  }, [loadFiles])

  const filteredFiles = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    const subset = files.filter((file) => {
      if (supermarketFilter !== 'all' && (file.supermarket || '').toLowerCase() !== supermarketFilter.toLowerCase()) {
        return false
      }
      if (!needle) return true
      return [
        file.filename,
        file.supermarket,
        file.custom_name,
        file.cloud_path,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    })

    const sorter = sortOrder === 'alphabetical'
      ? (a: ClassificationCloudFile, b: ClassificationCloudFile) => a.filename.localeCompare(b.filename)
      : (a: ClassificationCloudFile, b: ClassificationCloudFile) => {
          const aDate = new Date(a.classification_date || a.upload_time || a.updated || 0).getTime()
          const bDate = new Date(b.classification_date || b.upload_time || b.updated || 0).getTime()
          return bDate - aDate
        }

    return subset.sort(sorter)
  }, [files, searchTerm, supermarketFilter, sortOrder])

  const openMetadataEditor = (file: ClassificationCloudFile) => {
    setMetadataEditor({
      cloudPath: file.cloud_path,
      filename: file.filename.replace(/\.json$/i, ''),
      supermarket: file.supermarket || '',
      customName: file.custom_name || '',
      classificationDate: toDatetimeLocalInput(file.classification_date || file.upload_time || file.updated),
    })
    
    // Scroll to editor after state update
    setTimeout(() => {
      const editorElement = document.querySelector('[data-metadata-editor]')
      if (editorElement) {
        editorElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 100)
  }

  const updateMetadataField = (field: keyof MetadataEditorState, value: string) => {
    setMetadataEditor((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleMetadataSave = async () => {
    if (!metadataEditor) return

    const { cloudPath, filename, supermarket, customName, classificationDate } = metadataEditor
    setActionKey(`update:${cloudPath}`)
    try {
      const updates: Record<string, unknown> = {
        filename: filename.trim(),
        supermarket: supermarket.trim() || undefined,
        custom_name: customName.trim() || undefined,
      }

      const isoDate = fromDatetimeLocalInput(classificationDate)
      if (isoDate) {
        updates.classification_date = isoDate
      }
      await classificationAPI.updateCloudMetadata(cloudPath, updates)
      setMetadataEditor(null)
      await loadFiles()
      window.dispatchEvent(new CustomEvent('classification-cloud-updated'))
    } catch (error: any) {
      console.error('Failed to update metadata:', error)
      setError(error?.message || 'Failed to update metadata')
    } finally {
      setActionKey(null)
    }
  }

  const handleDownload = async (file: ClassificationCloudFile) => {
    setActionKey(`download:${file.cloud_path}`)
    try {
      const response = await classificationAPI.downloadCloudResult(file.cloud_path)
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to download cloud file')
      }

      const rawContent = response.raw || JSON.stringify(response.data, null, 2)
      const blob = new Blob(
        [typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2)],
        { type: 'application/json' },
      )
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = response.filename || file.filename || 'classification-results.json'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
    } catch (error: any) {
      console.error('Failed to download cloud file:', error)
      setError(error?.message || 'Failed to download cloud file')
    } finally {
      setActionKey(null)
    }
  }

  const handleDelete = async (file: ClassificationCloudFile) => {
    if (!window.confirm(`Delete ${file.filename}? This cannot be undone.`)) return

    setActionKey(`delete:${file.cloud_path}`)
    try {
      const response = await classificationAPI.deleteCloudResult(file.cloud_path)
      if (!response?.success) {
        throw new Error(response?.error || 'Failed to delete cloud file')
      }
      await loadFiles()
      window.dispatchEvent(new CustomEvent('classification-cloud-updated'))
    } catch (error: any) {
      console.error('Failed to delete cloud file:', error)
      setError(error?.message || 'Failed to delete cloud file')
    } finally {
      setActionKey(null)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-lg shadow-slate-200/60 backdrop-blur-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Cloud Saved Files</h3>
          <p className="text-sm text-slate-600">
            Manage classifier exports stored in the shared workspace. Rename runs, audit metadata, and download or
            remove obsolete batches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadFiles}
            disabled={loading}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              loading
                ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                : 'bg-slate-900 text-white hover:-translate-y-0.5 hover:bg-slate-700'
            }`}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {files.length} file{files.length === 1 ? '' : 's'} • {totalSize}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by filename, supermarket, or label"
              className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supermarket</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSupermarketFilter('all')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  supermarketFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-200/80'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {uniqueSupermarkets.map((store) => (
                <button
                  key={store}
                  type="button"
                  onClick={() => setSupermarketFilter(store)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    supermarketFilter === store
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-200/80'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {store}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort</label>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSortOrder('recent')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sortOrder === 'recent' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Newest First
              </button>
              <button
                type="button"
                onClick={() => setSortOrder('alphabetical')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  sortOrder === 'alphabetical'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                A → Z
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-slate-600">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
          <p className="text-sm font-medium">Loading cloud files…</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          <p className="text-base font-semibold text-slate-800">No files match your filters</p>
          <p className="mt-1 text-sm">Adjust the search or add new classifier exports from the processing screen.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {filteredFiles.map((file) => (
            <div
              key={file.cloud_path}
              className="group rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-200/70">
                    📁
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-slate-900" title={file.filename}>{file.filename}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      {file.supermarket && (
                        <span className="rounded-full bg-slate-100 px-2 py-1 capitalize">{file.supermarket}</span>
                      )}
                      {file.custom_name && (
                        <span className="truncate rounded-full bg-blue-50 px-2 py-1 text-blue-700" title={file.custom_name}>{file.custom_name}</span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-1">{formatFileSize(file.size)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-shrink-0 flex-col items-start gap-2 text-xs text-slate-500 md:items-end">
                  <span className="whitespace-nowrap">
                    Classified:{' '}
                    {file.classification_date ? formatDateTime(file.classification_date) : '—'}
                  </span>
                  <span className="whitespace-nowrap">
                    Uploaded:{' '}
                    {file.upload_time || file.updated ? formatDateTime(file.upload_time || file.updated || '') : '—'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(file)}
                  disabled={isBusy('download', file.cloud_path)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isBusy('download', file.cloud_path)
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-blue-600 text-white shadow-sm shadow-blue-200/80 hover:-translate-y-0.5 hover:bg-blue-700'
                  }`}
                >
                  {isBusy('download', file.cloud_path) ? 'Downloading…' : 'Download'}
                </button>
                <button
                  type="button"
                  onClick={() => openMetadataEditor(file)}
                  disabled={isBusy('update', file.cloud_path)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isBusy('update', file.cloud_path)
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-amber-500/90 text-white shadow-sm shadow-amber-200/70 hover:-translate-y-0.5 hover:bg-amber-500'
                  }`}
                >
                  Edit Metadata
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(file)}
                  disabled={isBusy('delete', file.cloud_path)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isBusy('delete', file.cloud_path)
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-red-100 text-red-600 hover:-translate-y-0.5 hover:bg-red-200'
                  }`}
                >
                  {isBusy('delete', file.cloud_path) ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {metadataEditor && (
        <div data-metadata-editor className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h4 className="text-sm font-semibold text-amber-900">Edit Metadata</h4>
              <p className="text-xs text-amber-700">
                Update labels or move this export to another supermarket folder. Saving refreshes the list automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMetadataEditor(null)}
              className="text-xs font-semibold uppercase tracking-wide text-amber-700 hover:text-amber-900"
            >
              Cancel
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">Filename</label>
              <input
                type="text"
                value={metadataEditor.filename}
                onChange={(event) => updateMetadataField('filename', event.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                placeholder="classification_keells_20250314"
              />
              <p className="mt-1 text-xs text-amber-700">.json extension is added automatically.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">Supermarket</label>
              <input
                type="text"
                value={metadataEditor.supermarket}
                onChange={(event) => updateMetadataField('supermarket', event.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                placeholder="e.g. Keells"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">Custom Label</label>
              <input
                type="text"
                value={metadataEditor.customName}
                onChange={(event) => updateMetadataField('customName', event.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700">
                Classification Date
              </label>
              <input
                type="datetime-local"
                value={metadataEditor.classificationDate}
                onChange={(event) => updateMetadataField('classificationDate', event.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setMetadataEditor(null)}
              className="rounded-lg border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMetadataSave}
              disabled={metadataEditor ? isBusy('update', metadataEditor.cloudPath) : false}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                metadataEditor && isBusy('update', metadataEditor.cloudPath)
                  ? 'cursor-not-allowed bg-amber-300'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {metadataEditor && isBusy('update', metadataEditor.cloudPath) ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClassifierCloudManager
