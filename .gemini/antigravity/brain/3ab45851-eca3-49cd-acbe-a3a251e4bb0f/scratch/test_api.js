
const fetch = require('node-fetch');

async function testRoleUpdate() {
    const email = 'test@example.com';
    const role = 'merchant';
    
    // This will likely fail in this environment because of missing auth,
    // but we can check if it returns a 401 as expected.
    try {
        const response = await fetch('http://localhost:3000/api/admin/users/role', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, role }),
        });
        
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Data:', data);
    } catch (error) {
        console.log('Error (expected if server not running):', error.message);
    }
}

testRoleUpdate();
