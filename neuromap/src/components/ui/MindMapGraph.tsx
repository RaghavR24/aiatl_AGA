import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import * as d3 from 'd3';

type Node = {
  id: string;
  name: string;
  type: 'main' | 'subtopic';
  infoPoints: string[];
};

type Edge = {
  sourceId: string;
  targetId: string;
};

type MindMapGraphProps = {
  nodes: Node[];
  edges: Edge[];
};

// Memoized ForceGraph3D to prevent unnecessary re-renders
const MemoizedForceGraph3D = memo(ForceGraph3D);

const MindMapGraph: React.FC<MindMapGraphProps> = ({ nodes, edges }) => {
  const fgRef = useRef<any>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const graphData = {
    nodes: nodes.map(node => ({
      id: node.id,
      name: node.name,
      type: node.type,
      infoPoints: node.infoPoints
    })),
    links: edges.map(edge => ({
      source: edge.sourceId,
      target: edge.targetId
    })),
  };

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: 0, y: -100, z: 400 },
        { x: 0, y: -100, z: 0 },
        0 // Set duration to 0 to avoid animation
      );

      // Apply force adjustments
      fgRef.current.d3Force('charge', d3.forceManyBody().strength(-5));
      fgRef.current.d3Force('center', d3.forceCenter(0, 0, 0));
      fgRef.current.d3Force('link').distance(50);
    }
  }, []);

  // Memoized handleNodeClick to prevent triggering re-renders
  const handleNodeClick = useCallback((node: any) => {
    const clickedNode = nodes.find(n => n.id === node.id);
    setSelectedNode(clickedNode || null);
  }, [nodes]);

  const createNodeThreeObject = (node: any) => {
    const isMain = node.type === 'main';
    const nodeColor = isMain ? '#FF7F7F' : '#87CEFA';
    const sphereRadius = isMain ? 12 : 8;

    const geometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: nodeColor });
    const sphere = new THREE.Mesh(geometry, material);

    return sphere;
  };

  // Inline memoized component for displaying selected node information
  const SelectedNodeInfo = memo(({ node }: { node: Node | null }) => {
    if (!node) return null;

    return (
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        background: 'rgba(255, 255, 255, 0.95)',
        color: '#000000',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        maxWidth: '250px',
        fontSize: '14px'
      }}>
        <h3 style={{ marginBottom: '10px', color: node.type === 'main' ? '#e74c3c' : '#2980b9' }}>
          {node.name}
        </h3>
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px' }}>
          {node.infoPoints.map((point, index) => (
            <li key={index} style={{ marginBottom: '6px' }}>{point}</li>
          ))}
        </ul>
      </div>
    );
  });

  return (
    <div style={{ height: '100%', position: 'relative', backgroundColor: '#ffffff' }}>
      <MemoizedForceGraph3D
        ref={fgRef}
        graphData={graphData}
        linkColor={() => '#000000'}
        linkWidth={2.5}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        nodeThreeObject={createNodeThreeObject}
        nodeThreeObjectExtend={true}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => setSelectedNode(null)}
        enableNodeDrag={false}
        showNavInfo={false}
        nodeLabel={(node: Node) => `<span style="color: black;">${node.name}</span>`}
        backgroundColor="#ffffff"
        width={800}
        height={600}
      />

      {/* Render selected node info */}
      <SelectedNodeInfo node={selectedNode} />
    </div>
  );
};

export default MindMapGraph;
