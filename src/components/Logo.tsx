export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-lg font-bold text-white ${className}`}>
      <span className="h-8 w-8 rounded-lg bg-sun" />
      FreelanceHQ
    </div>
  )
}
