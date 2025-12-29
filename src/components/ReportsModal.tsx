'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Report, getReports, deleteReport, updateReport } from '@/lib/reports';
import ReportCard from './ReportCard';
import SaveReportModal from './SaveReportModal';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewReport: (report: Report) => void;
}

const ReportsModal: React.FC<ReportsModalProps> = ({ isOpen, onClose, onViewReport }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState<Report | null>(null);

  // Load reports when modal opens
  useEffect(() => {
    if (isOpen) {
      setReports(getReports());
    }
  }, [isOpen]);

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
    onClose();
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

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '24px',
          width: '800px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          border: '0.5px solid var(--border-default)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            Saved Reports
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3.80773 13.7071C3.41721 14.0976 2.78419 14.0976 2.39367 13.7071C2.00323 13.3166 2.00318 12.6835 2.39367 12.293L6.63684 8.05086L2.39367 3.80769C2.00328 3.41716 2.00319 2.78411 2.39367 2.39363C2.78416 2.00323 3.41723 2.00326 3.80773 2.39363L8.0509 6.6368L12.2931 2.39363C12.6836 2.00325 13.3167 2.00323 13.7071 2.39363C14.0976 2.78412 14.0976 3.41716 13.7071 3.80769L9.46496 8.05086L13.7071 12.293C14.0976 12.6835 14.0976 13.3166 13.7071 13.7071C13.3166 14.0976 12.6836 14.0976 12.2931 13.7071L8.0509 9.46492L3.80773 13.7071Z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}>
          {reports.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: 'var(--text-tertiary)',
                padding: '48px 0',
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
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              alignContent: 'start'
            }}>
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
        </div>

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
    </div>,
    document.body
  );
};

export default ReportsModal;
