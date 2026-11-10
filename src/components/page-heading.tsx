export function PageHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="pt-6 sm:pt-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 font-serif italic text-muted">{subtitle}</p>
    </div>
  );
}
