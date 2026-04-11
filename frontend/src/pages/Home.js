import React from 'react';

function Home() {
  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>🏠 Welcome to Note App</h1>
      <p>A simple note-taking application built with MERN stack</p>
      <div style={{ marginTop: '30px' }}>
        <h3>Features:</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li>✅ Create notes</li>
          <li>✅ View all notes</li>
          <li>✅ Delete notes</li>
          <li>✅ REST API backend</li>
        </ul>
      </div>
    </div>
  );
}

export default Home;
