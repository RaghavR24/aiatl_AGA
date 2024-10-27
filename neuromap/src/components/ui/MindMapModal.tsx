import React, { useState } from 'react';
import MindMapGraph from "@/components/ui/MindMapGraph";
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { X, Menu, Search, Maximize2 } from 'lucide-react';

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
      <MindMapGraph nodes={nodes} edges={edges} />

      {/* Buttons for larger screens */}
      <div className="absolute top-4 right-4 hidden sm:flex space-x-2 z-10">
        <Button 
          onClick={() => { setIsSearchOpen(true); setSearchTerm(""); setSearchResults([]); }} 
          className="bg-white hover:bg-gray-100 text-black px-3 py-2 text-sm flex items-center"
        >
          <Search className="w-4 h-4 mr-2" />
          Search for Connection
        </Button>
        <Button 
          onClick={() => setIsGraphExpanded(true)} 
          className="bg-white hover:bg-gray-100 text-black px-3 py-2 text-sm flex items-center"
        >
          <Maximize2 className="w-4 h-4 mr-2" />
          Expand
        </Button>
      </div>

      {/* Menu button for small screens */}
      <div className="absolute top-4 right-4 sm:hidden z-10">
        <Button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="bg-white hover:bg-gray-100 text-black p-2"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Dropdown menu for small screens */}
      {isMenuOpen && (
        <div className="absolute top-14 right-4 bg-white shadow-md rounded-md overflow-hidden sm:hidden z-20">
          <Button 
            onClick={() => { 
              setIsSearchOpen(true); 
              setSearchTerm(""); 
              setSearchResults([]); 
              setIsMenuOpen(false);
            }} 
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-black"
          >
            Search for Connection
          </Button>
          <Button 
            onClick={() => {
              setIsGraphExpanded(true);
              setIsMenuOpen(false);
            }} 
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-black"
          >
            Expand
          </Button>
        </div>
      )}

      {/* Search modal */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          >
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col"
            >
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="text-lg font-semibold">Search for Connection</h3>
                <Button
                  onClick={() => setIsSearchOpen(false)}
                  variant="ghost"
                  size="sm"
                  className="p-1"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-4 overflow-y-auto flex-grow">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Enter keyword to search"
                  className="w-full p-2 border rounded mb-4"
                />
                <Button onClick={handleSearch} className="w-full bg-blue-500 hover:bg-blue-600 text-white">
                  Search
                </Button>

                {searchResults.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">Search Results:</h4>
                    <ul className="space-y-2">
                      {searchResults.map((result, index) => (
                        <li key={index} className="border-b pb-2">
                          <span className="font-semibold">
                            {result.node.name} 
                            <span className="ml-2 text-sm font-normal text-gray-500">
                              ({result.node.type === 'main' ? 'Main Topic' : 'Subtopic'})
                            </span>
                          </span>
                          <ul className="ml-4 mt-1 space-y-1">
                            {result.connections.map((connection, i) => (
                              <li key={i} className="text-sm">
                                Connected to: {connection.name}
                                <span className="ml-2 text-xs text-gray-500">
                                  ({connection.type === 'main' ? 'Main Topic' : 'Subtopic'})
                                </span>
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Graph Modal */}
      <AnimatePresence>
        {isGraphExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-white"
          >
            <div className="flex justify-end p-4">
              <Button
                onClick={() => setIsGraphExpanded(false)}
                className="bg-white hover:bg-gray-100 text-black"
              >
                <X className="w-5 h-5 mr-2" />
                Close
              </Button>
            </div>
            <div className="flex-grow overflow-hidden">
              <MindMapGraph nodes={nodes} edges={edges} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MindMapModal;
