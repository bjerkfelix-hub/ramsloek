export function PageHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="font-display text-[2.25rem] font-semibold text-ink sm:text-5xl">
        {title}
      </h1>
      {lead && <p className="max-w-[60ch] text-lg text-muted">{lead}</p>}
    </header>
  );
}
