export default function AdInventoryCategoryLoading() {
    return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center px-8 py-16 bg-white border-b border-border-secondary">
            <div
                className="h-9 w-9 rounded-full border-2 border-tl-master-brand-dark-green border-t-transparent animate-spin"
                aria-hidden
            />
            <p className="mt-4 text-sm font-semibold text-foreground-body">Opening ad category</p>
            <p className="mt-1 text-xs text-foreground-muted text-center max-w-sm">
                Loading inventory and rules for this vertical.
            </p>
        </div>
    );
}
