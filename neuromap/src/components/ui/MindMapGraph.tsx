import React from 'react';

type MindMapGraphProps = {
  nodes: any[];
  edges: any[];
};

const MindMapGraph: React.FC<MindMapGraphProps> = ({ nodes, edges }) => {
  return (
    <div>
      {/* Temporary empty component */}
      <p>MindMapGraph component (temporarily empty)</p>
    </div>
  );
};

export default MindMapGraph;
