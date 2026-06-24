// Friendly "no access" page — shown when a user's role isn't permitted for a
// route in the page_access matrix.
export default function NoAccessPage() {
  return (
    <div className="page flex items-center justify-center" style={{ minHeight: '70vh' }}>
      <div className="glass p-10 max-w-md text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-lg font-bold text-white mb-1">No access to this page</h1>
        <p className="text-sm text-slate-400 mb-5">
          Your role doesn’t have permission to view this. If you think this is a mistake, contact your QA admin.
        </p>
        <a href="/results" className="btn btn-primary text-sm">Go to Results</a>
      </div>
    </div>
  )
}
