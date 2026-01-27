import SmartFileManager from '@/components/files/SmartFileManager'
import { crawlerAPI } from '@/lib/api'
import type { FileViewerState } from '@/app/app/crawler/types'

type ToastHandler = (title: string, description: string) => void

type FilesTabProps = {
    setFileViewModal: (updater: FileViewerState | ((prev: FileViewerState) => FileViewerState)) => void
    loadFileContent: (store: string, filename: string, category?: string) => Promise<void> | void
    sendFileToClassifier: (items: any[]) => Promise<void> | void
    warning: ToastHandler
    showError: ToastHandler
}

export const FilesTab = ({ setFileViewModal, loadFileContent, sendFileToClassifier, warning, showError }: FilesTabProps) => {
    const handleViewFile = (file: any) => {
        setFileViewModal({
            open: true,
            store: file.store,
            filename: file.name,
            content: null,
        })

        void loadFileContent(file.store, file.name, file.category)
    }

    const handleLoadToClassifier = async (file: any) => {
        try {
            const content = await crawlerAPI.loadFile(file.store, file.name, file.category)

            if (content && Array.isArray(content.items) && content.items.length > 0) {
                await sendFileToClassifier(content.items)
            } else {
                warning('No Products', 'No products found in this file to send to classifier')
            }
        } catch (error) {
            console.error('Load to classifier error:', error)
            showError('Load Error', 'Failed to load file content for classifier')
        }
    }

    return (
        <div className='rounded-2xl border border-slate-200/80 bg-white/70 p-2 shadow-sm supports-[backdrop-filter]:bg-white/60'>
            <SmartFileManager onViewFile={handleViewFile} onLoadToClassifier={handleLoadToClassifier} />
        </div>
    )
}
