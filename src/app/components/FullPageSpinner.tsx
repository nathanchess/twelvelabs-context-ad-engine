import { Spinner, Text } from "@twelvelabs-io/react";

interface FullPageSpinnerProps {
  title: string;
  description?: string;
}

export default function FullPageSpinner({ title, description }: FullPageSpinnerProps) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-8 py-16 bg-surface-white">
      <Spinner size="lg" aria-hidden />
      <Text variant="paragraph-medium" className="mt-5 font-semibold text-foreground-body">
        {title}
      </Text>
      {description ? (
        <Text variant="paragraph-small" className="mt-1.5 text-center max-w-md leading-relaxed text-foreground-muted">
          {description}
        </Text>
      ) : null}
    </div>
  );
}
