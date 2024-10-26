import React, { useState } from 'react';
import { Dialog, DialogContent, DialogOverlay } from "@reach/dialog";
import "@reach/dialog/styles.css";
import MindMapGraph from "@/components/ui/MindMapGraph"; // Adjust path if necessary

/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/prefer-as-const */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

interface Node {
  id: string;
  name: string;
  type: 'main' | 'subtopic';
  infoPoints: string[];
}

interface Edge {
  sourceId: string;
  targetId: string;
}

type MindMapModalProps = {
  nodes: Node[];
  edges: Edge[];
};

type SearchResult = {
  node: Node;
  connections: Node[];
};

const MindMapModal: React.FC<MindMapModalProps> = ({ nodes, edges }) => {
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const handleSearch = () => {
    const results = nodes.filter(node => 
      node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.infoPoints.some((info: string) => info.toLowerCase().includes(searchTerm.toLowerCase()))
    ).map(node => {
      const connectedNodeIds = new Set();
      const connections = edges
        .filter(edge => {
          const isConnected = edge.sourceId === node.id || edge.targetId === node.id;
          const connectedNodeId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
          if (isConnected && !connectedNodeIds.has(connectedNodeId)) {
            connectedNodeIds.add(connectedNodeId);
            return true;
          }
          return false;
        })
        .map(edge => {
          const connectedNodeId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
          return nodes.find(n => n.id === connectedNodeId)!; // Add non-null assertion operator
        })
        .filter((n): n is Node => n !== undefined); // Type guard to ensure non-undefined values

      return { node, connections };
    });

    setSearchResults(results);
  };

  return (
    <div className="relative h-full w-full">
      <div className="bg-white h-full w-full rounded-xl p-4">
        <MindMapGraph nodes={nodes} edges={edges} />

        <button onClick={() => setIsGraphExpanded(true)} className="absolute top-2 right-2">
          Expand
        </button>

        <button onClick={() => { setIsSearchOpen(true); setSearchTerm(""); setSearchResults([]); }} className="absolute top-2 right-20">
          Search for Connection
        </button>
      </div>

      {isGraphExpanded && (
        <Dialog onDismiss={() => setIsGraphExpanded(false)} aria-label="Expanded Mind Map" style={{ inset: 0, position: 'fixed', overflow: 'hidden' }}>
          <DialogOverlay style={{ background: "#ffffff", inset: 0, position: 'fixed' }}>
            <DialogContent style={{
              width: '100vw',
              height: '100vh',
              padding: 0,
              margin: 0,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}>
              <MindMapGraph nodes={nodes} edges={edges} />
            </DialogContent>
            <button onClick={() => setIsGraphExpanded(false)} style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              backgroundColor: '#e74c3c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '50%',
              padding: '10px',
              cursor: 'pointer',
              zIndex: 10,
            }}>
              Close
            </button>
          </DialogOverlay>
        </Dialog>
      )}

      {isSearchOpen && (
        <DialogOverlay style={{ background: "rgba(0, 0, 0, 0.5)", inset: 0, position: 'fixed' }}>
          <DialogContent style={{
            width: '500px', // Adjusted width
            height: '80vh', // Adjusted height
            padding: '20px',
            margin: 'auto',
            marginTop: '10vh',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setIsSearchOpen(false)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                backgroundColor: '#e74c3c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '50%',
                padding: '5px 8px',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
            <h3 className="mb-4 text-lg font-semibold">Search for Connection</h3>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Enter keyword to search"
              className="w-full p-2 border rounded mb-4"
            />
            <button onClick={handleSearch} className="w-full p-2 bg-blue-500 text-white rounded mb-4">
              Search
            </button>

            {searchResults.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Search Results:</h4>
                <ul>
                  {searchResults.map((result, index) => (
                    <li key={index} className="mb-2">
                      <span className="font-semibold">
                        {result.node.name} 
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          ({result.node.type === 'main' ? 'Main Topic' : 'Subtopic'})
                        </span>
                      </span>
                      <ul className="ml-4 list-disc">
                        {result.connections.map((connection: typeof nodes[0], i: number) => (
                          <li key={i} className="mt-2">
                            <span className="font-semibold">
                              {connection.name} 
                              <span className="ml-2 text-sm font-normal text-gray-500">
                                ({connection.type === 'main' ? 'Main Topic' : 'Subtopic'})
                              </span>
                            </span>
                            <ul className="ml-4 list-disc">
                              {connection.infoPoints.map((info: string, j: number) => (
                                <li key={j} className="text-sm">{info}</li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {searchResults.length === 0 && searchTerm && (
              <p className="text-sm text-gray-500 mt-4">No connections found for &ldquo;{searchTerm}&rdquo;</p>
            )}
          </DialogContent>
        </DialogOverlay>
      )}
    </div>
  );
};

export default MindMapModal;
