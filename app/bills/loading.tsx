export default function BillsLoading() {
  return (
    <>
      <header className="toolbar bill-entry-toolbar">
        <div>
          <h2>กรอกบิล</h2>
          <p>กำลังโหลดฟอร์มและรายการ</p>
        </div>
      </header>
      <section className="content table-view bills-view">
        <div className="bills-compact-bar">
          <div className="skeleton-form" />
          <div className="skeleton-action" />
        </div>
        <div className="panel skeleton-table" />
      </section>
    </>
  );
}
