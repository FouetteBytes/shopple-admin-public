import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classificationAPI } from '@/lib/api'
import { fromDatetimeLocalInput, toDatetimeLocalInput } from '@/utils/datetime'

interface ManualCloudUploaderProps {
  onUploadSuccess?: () => void
}

type ManualFileStatus = 'pending' | 'uploading' | 'success' | 'error'

interface ManualUploadFile {
  id: string
  originalName: string
  baseName: string
  results: any[]
  metadata: Record<string, any> | null
  supermarket: string
  customName: string
  classificationDate: string
  status: ManualFileStatus
  message?: string
}

const buildId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const extractManualResults = (payload: any) => {
  if (Array.isArray(payload)) {
    return { results: payload, metadata: null }
  }
  if (payload?.results && Array.isArray(payload.results)) {
    return { results: payload.results, metadata: payload.metadata || null }
  }
  if (payload?.products && Array.isArray(payload.products)) {
    return { results: payload.products, metadata: payload.metadata || null }
  }
  if (payload?.data && Array.isArray(payload.data)) {
    return { results: payload.data, metadata: payload.metadata || null }
  }
  throw new Error('JSON must include an array of results or products')
}

const ManualCloudUploader: React.FC<ManualCloudUploaderProps> = ({ onUploadSuccess }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<ManualUploadFile[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null)
  const [isUploadingAll, setIsUploadingAll] = useState(false)
  const filesRef = useRef<ManualUploadFile[]>(files)

  useEffect(() => {
    filesRef.current = files
  }, [files])

  const totalPending = useMemo(() => files.filter((file) => file.status === 'pending').length, [files])
  const totalUploaded = useMemo(() => files.filter((file) => file.status === 'success').length, [files])
  const totalErrors = useMemo(
    () => files.filter((file) => file.status === 'error' && file.results.length > 0).length,
    [files],
  )
  const uploadableCount = totalPending + totalErrors

  const updateFile = useCallback((id: string, updater: (file: ManualUploadFile) => ManualUploadFile) => {
    setFiles((prev) => prev.map((file) => (file.id === id ? updater(file) : file)))
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id))
  }, [])

  const parseFile = useCallback(async (file: File) => {
    const text = await file.text()
    const parsed = JSON.parse(text)
    const { results, metadata } = extractManualResults(parsed)
    if (!results.length) {
      throw new Error('No classification results found in file')
    }

    const baseName = file.name.replace(/\.json$/i, '')
    const inferredSupermarket = metadata?.display_supermarket || metadata?.supermarket || ''
    const classificationDate = toDatetimeLocalInput(metadata?.classification_date || metadata?.generated_at)
    const customName = metadata?.custom_name || ''

    return {
      id: buildId(),
      originalName: file.name,
      baseName,
      results,
      metadata: metadata || null,
      supermarket: inferredSupermarket,
      customName,
      classificationDate,
      status: 'pending' as ManualFileStatus,
    }
  }, [])

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    setGlobalError(null)
    setGlobalSuccess(null)

    const incoming = Array.from(fileList)
    if (!incoming.length) return

    const parsedFiles: ManualUploadFile[] = []
    for (const file of incoming) {
      try {
        const parsed = await parseFile(file)
        parsedFiles.push(parsed)
      } catch (error: any) {
        parsedFiles.push({
          id: buildId(),
          originalName: file.name,
          baseName: file.name.replace(/\.json$/i, ''),
          results: [],
          metadata: null,
          supermarket: '',
          customName: '',
          classificationDate: '',
          status: 'error',
          message: error?.message || 'Failed to read file',
        })
      }
    }

    setFiles((prev) => [...prev, ...parsedFiles])
    if (parsedFiles.some((file) => file.status === 'success' || file.status === 'pending')) {
      window.dispatchEvent(new CustomEvent('manual-cloud-files-staged'))
    }
  }, [parseFile])

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    if (event.dataTransfer.files) {
      await handleFiles(event.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDrag = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true)
    } else if (event.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const buildPayload = (file: ManualUploadFile) => {
    const payload: Parameters<typeof classificationAPI.manualUploadCloudResult>[0] = {
      results: file.results,
    }

    if (file.supermarket.trim()) {
      payload.supermarket = file.supermarket.trim()
    }
    if (file.customName.trim()) {
      payload.custom_name = file.customName.trim()
    }
    const isoDate = fromDatetimeLocalInput(file.classificationDate)
    if (isoDate) {
      payload.classification_date = isoDate
    }
    const finalName = file.baseName.trim()
    if (finalName) {
      payload.filename = finalName
    }
    return payload
  }

  const uploadFile = useCallback(async (file: ManualUploadFile) => {
    if (!file.results.length) {
      updateFile(file.id, (current) => ({ ...current, status: 'error', message: 'No results to upload' }))
      return
    }

    updateFile(file.id, (current) => ({ ...current, status: 'uploading', message: undefined }))
    try {
      const response = await classificationAPI.manualUploadCloudResult(buildPayload(file))
      if (!response?.success) {
        throw new Error(response?.error || 'Manual upload failed')
      }

      const uploadedName = response.filename || `${file.baseName}.json`
      updateFile(file.id, (current) => ({
        ...current,
        status: 'success',
        message: `Uploaded as ${uploadedName}`,
      }))
      window.dispatchEvent(new CustomEvent('classification-cloud-updated'))
      onUploadSuccess?.()
    } catch (error: any) {
      updateFile(file.id, (current) => ({
        ...current,
        status: 'error',
        message: error?.message || 'Failed to upload file',
      }))
    }
  }, [onUploadSuccess, updateFile])

  const handleUploadAll = useCallback(async () => {
    const initialSuccess = files.filter((file) => file.status === 'success').length
    const pending = files.filter(
      (file) => (file.status === 'pending' || file.status === 'error') && file.results.length > 0,
    )
    if (!pending.length) {
      setGlobalError('Add at least one valid classification file before uploading')
      return
    }

    setGlobalError(null)
    setGlobalSuccess(null)
    setIsUploadingAll(true)

    for (const file of pending) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(file)
    }

    setIsUploadingAll(false)
    const latestSuccess = filesRef.current.filter((file) => file.status === 'success').length
    const diff = Math.max(0, latestSuccess - initialSuccess)
    if (diff) {
      setGlobalSuccess(`Uploaded ${diff} file${diff === 1 ? '' : 's'} to cloud`)
    }
  }, [files, uploadFile])

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      await handleFiles(event.target.files)
      event.target.value = ''
    }
  }

  const clearAll = () => {
    setFiles([])
    setGlobalError(null)
    setGlobalSuccess(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-lg shadow-blue-100/40 backdrop-blur-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Manual Cloud Upload</h3>
          <p className="text-sm text-slate-600">
            Drop multiple classification exports to push them straight into the cloud workspace. Edit metadata before
            syncing and monitor progress live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleUploadAll}
            disabled={isUploadingAll || !files.some((file) => file.status === 'pending' || file.status === 'error')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all duration-200 ${
              isUploadingAll || !files.some((file) => file.status === 'pending' || file.status === 'error')
                ? 'cursor-not-allowed bg-slate-400'
                : 'bg-blue-600 hover:-translate-y-0.5 hover:bg-blue-700 shadow-lg shadow-blue-200/60'
            }`}
          >
            {isUploadingAll
              ? 'Uploading…'
              : `Upload ${uploadableCount || files.length} File${files.length === 1 ? '' : 's'}`}
          </button>
          {files.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      <div
        className={`mt-6 flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
          dragActive
            ? 'border-blue-500 bg-blue-50/80 shadow-inner shadow-blue-200'
            : 'border-slate-200 bg-slate-50 hover:border-blue-300'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-5xl">☁️</div>
        <p className="mt-4 text-base font-semibold text-slate-900">
          {files.length ? 'Add more classification files' : 'Drop classification JSON files here'}
        </p>
        <p className="mt-1 max-w-[320px] text-center text-sm text-slate-500">
          We support Shopple exports and third-party classifier outputs containing a <code className="font-mono">results</code>
          {' '}
          array. Metadata fields are auto-detected.
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700"
        >
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {globalError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
        </div>
      )}
      {globalSuccess && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {globalSuccess}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-8 space-y-4">
          {files.map((file) => {
            const infoItems = file.metadata
              ? Object.entries(file.metadata)
                  .filter(([key]) => ![
                  'supermarket',
                  'display_supermarket',
                  'custom_name',
                  'classification_date',
                  'generated_at',
                  'supermarket_slug',
                ].includes(key))
                  .slice(0, 4)
              : []
            return (
              <div
                key={file.id}
                className="group rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-[220px] max-w-xl">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-200/70">
                        
                      </div>
                      <div>
                        <p className="text-base font-semibold text-slate-900">{file.originalName}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {file.results.length} products detected
                        </p>
                      </div>
                    </div>
                    {infoItems.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {infoItems.map(([key, value]) => (
                          <span
                            key={key}
                            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition group-hover:bg-blue-50 group-hover:text-blue-700"
                          >
                            {key}: {typeof value === 'string' ? value : JSON.stringify(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex w-full flex-col gap-3 lg:max-w-3xl">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Supermarket
                        </label>
                        <input
                          type="text"
                          value={file.supermarket}
                          onChange={(event) =>
                            updateFile(file.id, (current) => ({ ...current, supermarket: event.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                          placeholder="e.g. Keells"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Classification Date
                        </label>
                        <input
                          type="datetime-local"
                          value={file.classificationDate}
                          onChange={(event) =>
                            updateFile(file.id, (current) => ({ ...current, classificationDate: event.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Custom Label
                        </label>
                        <input
                          type="text"
                          value={file.customName}
                          onChange={(event) =>
                            updateFile(file.id, (current) => ({ ...current, customName: event.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
                          placeholder="Optional descriptor"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`min-w-[90px] rounded-full px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide ${
                          file.status === 'success'
                            ? 'bg-emerald-50 text-emerald-700'
                            : file.status === 'error'
                            ? 'bg-red-50 text-red-600'
                            : file.status === 'uploading'
                            ? 'bg-blue-50 text-blue-600'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {file.status === 'success'
                          ? 'Uploaded'
                          : file.status === 'error'
                          ? 'Needs attention'
                          : file.status === 'uploading'
                          ? 'Uploading…'
                          : 'Ready'}
                      </span>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => uploadFile(file)}
                          disabled={file.status === 'uploading' || file.results.length === 0}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            file.status === 'uploading' || file.results.length === 0
                              ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                              : 'bg-blue-600 text-white shadow-sm shadow-blue-200/70 hover:-translate-y-0.5 hover:bg-blue-700'
                          }`}
                        >
                          {file.status === 'uploading' ? 'Uploading…' : 'Upload'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFile(file.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {file.message && (
                      <div
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          file.status === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : file.status === 'error'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : 'border-blue-200 bg-blue-50 text-blue-700'
                        }`}
                      >
                        {file.message}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-800">Upload Summary:</span>
            <span>{files.length} file{files.length === 1 ? '' : 's'} staged</span>
            <span>•</span>
            <span>{totalPending} pending</span>
            <span>•</span>
            <span>{totalUploaded} uploaded</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManualCloudUploader
