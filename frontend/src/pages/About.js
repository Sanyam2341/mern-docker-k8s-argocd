import React from 'react';

function About() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>ℹ️ About This App</h1>
      <p>This is a learning project to understand:</p>
      <ul>
        <li><strong>Frontend:</strong> React (runs on port 3000)</li>
        <li><strong>Backend:</strong> Node.js + Express (runs on port 5000)</li>
        <li><strong>API:</strong> REST API with JSON</li>
        <li><strong>HTTP Methods:</strong> GET, POST, DELETE</li>
      </ul>
      
      <h3>How it works:</h3>
      <ol>
        <li>User interacts with React frontend</li>
        <li>Frontend makes HTTP requests to backend</li>
        <li>Backend processes requests and returns JSON</li>
        <li>Frontend displays the data</li>
      </ol>

      <h3>Tech Stack:</h3>
      <p><strong>MERN:</strong> MongoDB (coming soon), Express, React, Node.js</p>
    </div>
  );
}

export default About;
