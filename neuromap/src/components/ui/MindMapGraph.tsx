import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, { Controls, Background, Node, Edge, useNodesState, useEdgesState } from 'react-flow-renderer';
import Modal from '@mui/material/Modal';
import Box from '@mui/material/Box';
import dagre from 'dagre';
/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/prefer-as-const */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
type NodeData = {
  id: string;
  name: string;
  type: 'main' | 'subtopic';
  infoPoints: string[];
};

type MindMap2DProps = {
  nodes: NodeData[];
  edges: { sourceId: string; targetId: string }[];
};

const modalStyle = {
  position: 'absolute' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 300,
  backgroundColor: '#ffffff', // Set modal background to white
  boxShadow: 24,
  p: 4,
  borderRadius: 2,
};

// Layout configuration for dagre
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
dagreGraph.setGraph({ rankdir: 'TB', align: 'UL', nodesep: 15, ranksep: 150 });

const nodeWidth = 150;
const nodeHeight = 50;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

const MindMap2D: React.FC<MindMap2DProps> = ({ nodes, edges }) => {
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Use useMemo to create initialNodes and initialEdges
  const initialNodes: Node[] = useMemo(() => nodes.map(node => ({
    id: node.id,
    data: { label: node.name, type: node.type },
    position: { x: 0, y: 0 },
    style: {
      background: node.type === 'main' ? '#FF7F7F' : '#87CEFA',
      color: '#000',
      padding: 10,
      borderRadius: 5,
      width: nodeWidth,
      textAlign: 'center' as const,
    },
  })), [nodes]);

  const initialEdges: Edge[] = useMemo(() => edges.map((edge, index) => ({
    id: `${edge.sourceId}-${edge.targetId}-${index}`,
    source: edge.sourceId,
    target: edge.targetId,
    animated: true,
    style: { stroke: '#000' },
  })), [edges]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  );

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Handle node clicks to show popup for info points
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const clickedNode = nodes.find(n => n.id === node.id);
      if (clickedNode && clickedNode.type === 'subtopic') {
        setSelectedNode(clickedNode);
        setIsModalOpen(true);
      }
    },
    [nodes]
  );

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
      >
        <Controls />
        <Background />
      </ReactFlow>

      {/* Modal for displaying info points of a clicked subtopic node */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        aria-labelledby="info-points-modal"
        aria-describedby="info-points-description"
        closeAfterTransition
      >
        <Box sx={modalStyle}>
          {selectedNode && (
            <>
              <h3 style={{ marginBottom: '10px', color: selectedNode.type === 'main' ? '#e74c3c' : '#2980b9' }}>
                {selectedNode.name} Info Points
              </h3>
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px' }}>
                {selectedNode.infoPoints.map((point, index) => (
                  <li key={index} style={{ marginBottom: '6px' }}>{point}</li>
                ))}
              </ul>
            </>
          )}
        </Box>
      </Modal>
    </div>
  );
};

export default MindMap2D;
