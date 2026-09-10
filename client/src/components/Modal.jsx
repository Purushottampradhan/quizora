export default function Modal({ open, title, onClose, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button className="absolute inset-0 bg-black/55" onClick={onClose} aria-label="Close" />
      <div className={`glass relative w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pop max-h-[92vh] overflow-y-auto`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-display text-xl font-bold">{title}</h3>
          <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
