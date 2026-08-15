import { useRef, useState } from 'react'
import { App as AntApp, Button, Progress, Typography } from 'antd'
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import {
  createBackup,
  downloadBackup,
  readBackup,
  restoreBackup,
  summarise,
  type BackupSummary,
} from '../../storage/backup'
import styles from './BackupControls.module.css'

/**
 * Save the whole library to a file, and read one back.
 *
 * Lives in About rather than the design drawer because it is not a property of
 * a poster — it is the answer to the question the About panel's own promise
 * raises. "Everything stays on this device" is the honest disclosure; the
 * reasonable next thought is "then what happens if I lose the device", and
 * until now the app had no answer.
 *
 * The immediate use is the move to a custom domain. IndexedDB is partitioned by
 * origin, so a reader at the new address finds an empty app and a full one at
 * the old one, with no way to connect them but a file carried across by hand.
 */
interface BackupControlsProps {
  /** Called once a restore has written, so the app can re-read the poster list. */
  onRestored: () => void
}

export function BackupControls({ onRestored }: BackupControlsProps) {
  const { message } = AntApp.useApp()
  const fileInput = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<'export' | 'restore' | undefined>()
  const [progress, setProgress] = useState(0)
  const [restored, setRestored] = useState<BackupSummary>()

  async function handleExport() {
    setBusy('export')
    setProgress(0)
    try {
      const backup = await createBackup((done, total) =>
        setProgress(total === 0 ? 100 : Math.round((done / total) * 100)),
      )
      downloadBackup(backup)
      const { posters, books, covers } = summarise(backup)
      message.success(`Saved ${posters} posters, ${books} books, ${covers} covers.`)
    } catch {
      message.error('Could not build the backup file.')
    } finally {
      setBusy(undefined)
      setProgress(0)
    }
  }

  async function handleFile(file: File) {
    setBusy('restore')
    setProgress(0)
    try {
      const backup = readBackup(await file.text())
      const result = await restoreBackup(backup, (done, total) =>
        setProgress(total === 0 ? 100 : Math.round((done / total) * 100)),
      )
      setRestored(summarise(backup))
      onRestored()

      // Reported precisely rather than as "done". A restore that merged into an
      // existing library has skipped posters on purpose, and a reader who is
      // not told that will read the lower number as data lost in transit.
      const parts = [`${result.postersAdded} posters`, `${result.coversAdded} covers`]
      if (result.postersSkipped > 0) {
        parts.push(`${result.postersSkipped} already here and left alone`)
      }
      message.success(`Restored ${parts.join(', ')}.`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Could not read that file.')
    } finally {
      setBusy(undefined)
      setProgress(0)
    }
  }

  return (
    <div className={styles.root}>
      <Typography.Paragraph className={styles.body}>
        Your posters live in this browser, on this device. Save a copy to a file and you can
        move everything to another browser — or bring it back if this one is ever cleared.
      </Typography.Paragraph>

      <div className={styles.actions}>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => void handleExport()}
          loading={busy === 'export'}
          disabled={busy !== undefined}
          block
        >
          {busy === 'export' ? 'Packing your library' : 'Save a backup file'}
        </Button>

        <Button
          icon={<UploadOutlined />}
          onClick={() => fileInput.current?.click()}
          loading={busy === 'restore'}
          disabled={busy !== undefined}
          block
        >
          {busy === 'restore' ? 'Restoring' : 'Restore from a backup'}
        </Button>
      </div>

      {busy !== undefined && (
        <Progress percent={progress} size="small" showInfo={false} strokeColor="var(--ra-accent)" />
      )}

      {restored && (
        <Typography.Paragraph className={styles.note}>
          Restored from a backup made {new Date(restored.exportedAt).toLocaleDateString()} —{' '}
          {restored.posters} posters and {restored.books} books. Nothing already on this device was
          replaced.
        </Typography.Paragraph>
      )}

      <Typography.Paragraph className={styles.note}>
        Restoring adds to what is here — it never overwrites a poster you already have, so
        importing the same file twice is safe.
      </Typography.Paragraph>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className={styles.hiddenInput}
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared so picking the same file twice in a row still fires a
          // change event — otherwise a failed restore cannot be retried
          // without choosing a different file first.
          event.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}
