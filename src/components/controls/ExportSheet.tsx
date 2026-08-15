import { SaveOutlined, ShareAltOutlined } from '@ant-design/icons'
import { Modal, Typography } from 'antd'
import styles from './ExportSheet.module.css'

/**
 * What to do with the finished poster.
 *
 * The export button used to do one thing and guess which: where the browser
 * could share files it opened the OS share sheet, otherwise it downloaded. On
 * a phone that meant the button labelled Download never downloaded — it handed
 * the poster to Android's sheet, and the copy you meant to keep was never
 * written.
 *
 * Saving and posting are different intentions and neither is the obvious
 * default, so the app asks rather than deciding. Two choices only: this is a
 * fork in the road, not a settings panel.
 *
 * The share option is omitted entirely where the device cannot share files,
 * since a choice that does nothing is worse than no choice.
 */

interface ExportSheetProps {
  open: boolean
  /** Whether this device can hand files to an OS share sheet. */
  canShare: boolean
  /** True while a poster is being rendered, so the sheet can show which. */
  busy?: 'save' | 'share'
  onSave: () => void
  onShare: () => void
  onCancel: () => void
}

export function ExportSheet({
  open,
  canShare,
  busy,
  onSave,
  onShare,
  onCancel,
}: ExportSheetProps) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      centered
      width={360}
      title="Your poster"
      // Rendering the poster takes a moment; dismissing mid-export would leave
      // the work running with nowhere to land.
      maskClosable={busy === undefined}
      closable={busy === undefined}
      /*
       * The shell already clips itself and the document, so antd does not need
       * to take the scrollbar away on open — and its restore afterwards was
       * leaving `body` able to scroll where it previously could not. Opening
       * this sheet once was enough to give the page a scrollbar that outlived
       * it, which pushed the action bar off the bottom of the screen.
       */
      styles={{ wrapper: { overflow: 'hidden' } }}
    >
      <div className={styles.options}>
        <button
          type="button"
          className={styles.option}
          onClick={onSave}
          disabled={busy !== undefined}
        >
          {/* The same mark the bar button carries, so the save path reads as
              one continuous action rather than two different ideas. */}
          <SaveOutlined className={styles.icon} aria-hidden />
          <span className={styles.text}>
            <Typography.Text className={styles.label}>
              {busy === 'save' ? 'Saving…' : 'Save to your photos'}
            </Typography.Text>
            <Typography.Text className={styles.hint}>
              Downloads the image. Keeps a copy you can post whenever.
            </Typography.Text>
          </span>
        </button>

        {canShare && (
          <button
            type="button"
            className={styles.option}
            onClick={onShare}
            disabled={busy !== undefined}
          >
            <ShareAltOutlined className={styles.icon} aria-hidden />
            <span className={styles.text}>
              <Typography.Text className={styles.label}>
                {busy === 'share' ? 'Preparing…' : 'Share'}
              </Typography.Text>
              <Typography.Text className={styles.hint}>
                Opens your phone's share menu — straight to Instagram.
              </Typography.Text>
            </span>
          </button>
        )}
      </div>
    </Modal>
  )
}
