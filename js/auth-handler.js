// Token Refresh Handler for Chat Pages
// Add this to your chat page JavaScript

class AuthHandler {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.setupAuthListener();
    }

    setupAuthListener() {
        // Listen for auth state changes
        this.supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth event:', event);
            
            if (event === 'SIGNED_OUT') {
                this.handleSessionExpired();
            }
            
            if (event === 'TOKEN_REFRESHED') {
                console.log('Token refreshed successfully');
            }
        });
    }

    async checkSession() {
        const { data: { session }, error } = await this.supabase.auth.getSession();
        
        if (error || !session) {
            this.handleSessionExpired();
            return null;
        }
        
        return session;
    }

    handleSessionExpired() {
        // Show session expired modal
        this.showSessionExpiredModal();
    }

    showSessionExpiredModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('session-expired-modal');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'session-expired-modal';
            modal.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                    <div style="background: white; padding: 30px; border-radius: 15px; max-width: 400px; text-align: center;">
                        <h2 style="margin-bottom: 15px; color: #1a1a1a;">Session Expired</h2>
                        <p style="margin-bottom: 20px; color: #666;">Your session has expired. Would you like to receive a new magic link?</p>
                        
                        <input type="email" id="reauth-email" placeholder="Your email" style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; margin-bottom: 15px; font-size: 1em;">
                        
                        <div style="display: flex; gap: 10px; justify-content: center;">
                            <button id="send-magic-link-btn" style="padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                                Send Magic Link
                            </button>
                            <button id="go-home-btn" style="padding: 12px 24px; background: #6c757d; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                                Go Home
                            </button>
                        </div>
                        
                        <p id="reauth-message" style="margin-top: 15px; color: #28a745; display: none;"></p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Add event listeners
            document.getElementById('send-magic-link-btn').addEventListener('click', () => {
                this.sendNewMagicLink();
            });
            
            document.getElementById('go-home-btn').addEventListener('click', () => {
                window.location.href = '/';
            });
            
            // Pre-fill email if available
            const session = this.supabase.auth.getSession();
            if (session?.user?.email) {
                document.getElementById('reauth-email').value = session.user.email;
            }
        }
        
        modal.style.display = 'block';
    }

    async sendNewMagicLink() {
        const email = document.getElementById('reauth-email').value.trim();
        const btn = document.getElementById('send-magic-link-btn');
        const message = document.getElementById('reauth-message');
        
        if (!email) {
            message.textContent = 'Please enter your email';
            message.style.color = '#dc3545';
            message.style.display = 'block';
            return;
        }
        
        btn.disabled = true;
        btn.textContent = 'Sending...';
        
        try {
            const { error } = await this.supabase.auth.signInWithOtp({
                email: email,
                options: {
                    emailRedirectTo: window.location.href
                }
            });
            
            if (error) throw error;
            
            message.textContent = '✓ Magic link sent! Check your email.';
            message.style.color = '#28a745';
            message.style.display = 'block';
            
            btn.textContent = 'Sent!';
            
        } catch (error) {
            message.textContent = 'Failed: ' + error.message;
            message.style.color = '#dc3545';
            message.style.display = 'block';
            
            btn.disabled = false;
            btn.textContent = 'Send Magic Link';
        }
    }

    // Call this before making API requests
    async ensureAuthenticated() {
        const session = await this.checkSession();
        
        if (!session) {
            throw new Error('Not authenticated');
        }
        
        return session.access_token;
    }
}

// Usage in your chat page:
// const authHandler = new AuthHandler(supabaseClient);
// 
// // Before making API calls:
// try {
//     const token = await authHandler.ensureAuthenticated();
//     // Make your API call with token
// } catch (error) {
//     // Session expired modal will show automatically
// }

export default AuthHandler;
