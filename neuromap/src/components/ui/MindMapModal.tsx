import React, { useState } from 'react';
import { Dialog, DialogContent, DialogOverlay } from "@reach/dialog";
import "@reach/dialog/styles.css"; // Optional: reach dialog styling
import MindMapGraph from "@/components/ui/MindMapGraph"; // Adjust the path if needed

type MindMapModalProps = {
  nodes: any[];
  edges: any[];
};

const MindMapModal: React.FC<MindMapModalProps> = ({ nodes, edges }) => {
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);

  return (
    <div className="relative">
      {/* Main Mind Map display with expand button */}
      <div className="bg-white bg-opacity-50 rounded-xl p-4 h-96">
        <MindMapGraph nodes={nodes} edges={edges} />
        <button
          onClick={() => setIsGraphExpanded(true)}
          className="absolute top-2 right-2"
        >
          Expand
        </button>
      </div>

      {/* Full-Screen Modal */}
      {isGraphExpanded && (
        <Dialog
          onDismiss={() => setIsGraphExpanded(false)}
          aria-label="Expanded Mind Map"
          style={{ inset: 0, position: 'fixed', overflow: 'hidden' }} // Full-screen positioning
        >
          <DialogOverlay style={{ background: "rgba(0, 0, 0, 0.8)", inset: 0, position: 'fixed' }}>
            <DialogContent
              style={{
                width: '100vw',
                height: '100vh',
                padding: 0,
                margin: 0,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                background: 'transparent'
              }}
            >
              <MindMapGraph nodes={nodes} edges={edges} />
              <button
                onClick={() => setIsGraphExpanded(false)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  backgroundColor: '#e74c3c',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '50%',
                  padding: '10px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </DialogContent>
          </DialogOverlay>
        </Dialog>
      )}
    </div>
  );
};

export default MindMapModal;
