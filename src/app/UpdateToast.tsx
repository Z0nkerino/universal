import { AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, X } from 'lucide-react';
import { Glass } from '@/ui/Glass';
import { Button, IconButton } from '@/ui/Button';
import { AppIcon } from '@/ui/Logo';
import { appUpdater, useUpdates } from '@/lib/desktop';
import { spring } from '@/lib/motion';
import { useT } from '@/lib/i18n';

/** Desktop app only: offers a downloaded update, or a new installer when the shell itself changed. */
export function UpdateToast() {
  const t = useT();
  const { status, dismissed, dismiss } = useUpdates();
  const show = !!appUpdater && (status.state === 'ready' || status.state === 'installer') && dismissed !== status.version;

  return (
    <AnimatePresence>
      {show && (
        <Glass
          strong
          role="status"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={spring}
          className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] items-center gap-3 p-3.5 lg:bottom-6 lg:right-6"
        >
          <AppIcon size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-[-0.01em]">{t(status.state === 'ready' ? 'Update ready' : 'New version available')}</p>
            <p className="truncate text-[13px] text-fg/55">
              {t('Version')} {status.version}. {t(status.state === 'ready' ? 'Restart to switch.' : 'Needs a fresh download.')}
            </p>
          </div>
          {status.state === 'ready' ? (
            <Button size="sm" variant="brand" icon={RefreshCw} onClick={() => void appUpdater!.apply()}>
              Restart
            </Button>
          ) : (
            <Button size="sm" variant="brand" icon={Download} onClick={() => void appUpdater!.download(status.url)}>
              Download
            </Button>
          )}
          <IconButton icon={X} label="Later" size={32} onClick={dismiss} />
        </Glass>
      )}
    </AnimatePresence>
  );
}
