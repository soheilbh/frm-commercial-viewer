import { cn } from '@/lib/utils';

/** Company logo for report headers — visible in A4 preview and always kept in DOM for print. */
export function ReportHeaderLogo({ showOnScreen }: { showOnScreen: boolean }) {
  return (
    <div
      className={cn(
        'report-header-logo shrink-0 items-center',
        showOnScreen ? 'flex' : 'hidden print:flex'
      )}
    >
      <img
        src='/logo.svg'
        alt='Company Logo'
        className='report-logo-light h-6 w-auto dark:hidden'
      />
      <img
        src='/logo-light.svg'
        alt='Company Logo'
        className='report-logo-dark hidden h-6 w-auto dark:block'
      />
    </div>
  );
}
