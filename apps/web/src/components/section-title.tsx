// Section label on the transfer page: quiet, so the wire stays the loudest thing.
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-medium text-muted-foreground">{children}</h2>;
}
