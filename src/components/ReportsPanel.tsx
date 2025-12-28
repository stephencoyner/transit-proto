'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Report, getReports, deleteReport, updateReport } from '@/lib/reports';
import ReportCard from './ReportCard';
import SaveReportModal from './SaveReportModal';

interface ReportsPanelProps {
  onViewReport: (report: Report) => void;
}

const ReportsPanel: React.FC<ReportsPanelProps> = ({ onViewReport }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState<Report | null>(null);

  // Load reports on mount
  useEffect(() => {
    setReports(getReports());
  }, []);

  // Refresh reports (called after save from capture button)
  const refreshReports = useCallback(() => {
    setReports(getReports());
  }, []);

  // Expose refresh function via window for capture button to call
  useEffect(() => {
    (window as unknown as { refreshReports?: () => void }).refreshReports = refreshReports;
    return () => {
      delete (window as unknown as { refreshReports?: () => void }).refreshReports;
    };
  }, [refreshReports]);

  const handleView = (report: Report) => {
    onViewReport(report);
  };

  const handleEdit = (report: Report) => {
    setEditingReport(report);
  };

  const handleDelete = (report: Report) => {
    setDeleteConfirmReport(report);
  };

  const confirmDelete = () => {
    if (deleteConfirmReport) {
      deleteReport(deleteConfirmReport.id);
      setReports(getReports());
      setDeleteConfirmReport(null);
    }
  };

  const handleSaveEdit = (name: string, description: string) => {
    if (editingReport) {
      updateReport(editingReport.id, { name, description });
      setReports(getReports());
      setEditingReport(null);
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      paddingTop: '20px',
      paddingBottom: '24px',
      marginRight: '-8px',
      paddingRight: '8px',
    }}>
      {/* Header */}
      <h2
        style={{
          fontSize: '24px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: '16px',
        }}
      >
        Reports
      </h2>

      {reports.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: 'var(--text-tertiary)',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 3C7.34315 3 6 4.34315 6 6V42C6 43.6569 7.34315 45 9 45H39C40.6569 45 42 43.6569 42 42V15L30 3H9Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M30 3V15H42"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15 24H33"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M15 33H27"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '14px', margin: 0, marginBottom: '4px' }}>
              No saved reports yet
            </p>
            <p style={{ fontSize: '13px', margin: 0, opacity: 0.7 }}>
              Click the capture button on the map to save a report
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Edit Modal */}
      <SaveReportModal
        isOpen={!!editingReport}
        onClose={() => setEditingReport(null)}
        onSave={handleSaveEdit}
        initialName={editingReport?.name || ''}
        initialDescription={editingReport?.description || ''}
        mode="edit"
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmReport && (
        <div
          onClick={() => setDeleteConfirmReport(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderRadius: '24px',
              padding: '24px',
              width: '320px',
              maxWidth: '90vw',
              border: '0.5px solid var(--border-default)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '12px',
              }}
            >
              Delete Report?
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                marginBottom: '20px',
              }}
            >
              Are you sure you want to delete &ldquo;{deleteConfirmReport.name}&rdquo;? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmReport(null)}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: '1px solid var(--border-default)',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#D31028',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPanel;
