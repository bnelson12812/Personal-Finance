"""
Personal Finance Dashboard
Streamlit web application for visualizing personal finance data
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import os
import hashlib
from data_processor import FinanceDataProcessor

# Page configuration
st.set_page_config(
    page_title="Personal Finance Dashboard",
    page_icon="💰",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ============================================
# PASSWORD PROTECTION
# ============================================

def hash_password(password):
    """Hash password for secure storage"""
    return hashlib.sha256(password.encode()).hexdigest()

def check_password():
    """Returns `True` if the user has entered the correct password."""
    
    # CHANGE THESE VALUES BEFORE DEPLOYING!
    # You can set multiple users if needed
    VALID_USERS = {
        "admin": hash_password("changeme123"),  # Username: admin, Password: changeme123
        # Add more users here: "username": hash_password("password"),
    }
    
    def password_entered():
        """Checks whether a password entered by the user is correct."""
        username = st.session_state["username"]
        password = st.session_state["password"]
        
        if username in VALID_USERS and VALID_USERS[username] == hash_password(password):
            st.session_state["password_correct"] = True
            st.session_state["current_user"] = username
            del st.session_state["password"]  # Don't store password
        else:
            st.session_state["password_correct"] = False

    # First run, show login screen
    if "password_correct" not in st.session_state:
        st.markdown("# 🔒 Personal Finance Dashboard")
        st.markdown("### Please log in to continue")
        st.text_input("Username", key="username")
        st.text_input("Password", type="password", key="password", on_change=password_entered)
        
        st.markdown("---")
        st.info("**Default credentials:**\n\nUsername: `admin`\n\nPassword: `changeme123`\n\n⚠️ **Important:** Change these in the code before deploying!")
        return False
    
    # Password incorrect, show error
    elif not st.session_state["password_correct"]:
        st.markdown("# 🔒 Personal Finance Dashboard")
        st.markdown("### Please log in to continue")
        st.text_input("Username", key="username")
        st.text_input("Password", type="password", key="password", on_change=password_entered)
        st.error("😕 Username or password incorrect")
        return False
    
    # Password correct
    else:
        return True

# Check authentication before showing dashboard
if not check_password():
    st.stop()

# ============================================
# MAIN DASHBOARD (Only shown if logged in)
# ============================================

# Custom CSS
st.markdown("""
    <style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        margin-bottom: 1rem;
    }
    .metric-card {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        margin: 0.5rem 0;
    }
    </style>
""", unsafe_allow_html=True)

# Initialize session state
if 'processor' not in st.session_state:
    st.session_state.processor = FinanceDataProcessor()
if 'data_loaded' not in st.session_state:
    st.session_state.data_loaded = False

# Sidebar - File Upload
st.sidebar.title("📊 Finance Dashboard")
st.sidebar.markdown(f"👤 Logged in as: **{st.session_state['current_user']}**")

# Logout button
if st.sidebar.button("🚪 Logout"):
    for key in list(st.session_state.keys()):
        del st.session_state[key]
    st.rerun()

st.sidebar.markdown("---")

st.sidebar.subheader("Upload Data")
debit_file = st.sidebar.file_uploader("Upload Debit Account CSV", type=['csv'])
credit_file = st.sidebar.file_uploader("Upload Credit Account CSV", type=['csv'])

if debit_file and credit_file:
    # Save uploaded files temporarily
    with open('temp_debit.csv', 'wb') as f:
        f.write(debit_file.getbuffer())
    with open('temp_credit.csv', 'wb') as f:
        f.write(credit_file.getbuffer())
    
    # Process data
    with st.spinner("Processing your financial data..."):
        try:
            df = st.session_state.processor.process_data('temp_debit.csv', 'temp_credit.csv')
            st.session_state.data_loaded = True
            st.sidebar.success(f"✅ Loaded {len(df)} transactions")
        except Exception as e:
            st.sidebar.error(f"Error processing files: {str(e)}")
            st.session_state.data_loaded = False

# Main content
if st.session_state.data_loaded:
    df = st.session_state.processor.combined_data
    
    # Header
    st.markdown('<div class="main-header">💰 Personal Finance Dashboard</div>', unsafe_allow_html=True)
    st.markdown(f"**Last Updated:** {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")
    st.markdown("---")
    
    # Sidebar filters
    st.sidebar.markdown("---")
    st.sidebar.subheader("Filters")
    
    # Date range filter
    min_date = df['Post Date'].min().date()
    max_date = df['Post Date'].max().date()
    
    date_range = st.sidebar.date_input(
        "Date Range",
        value=(min_date, max_date),
        min_value=min_date,
        max_value=max_date
    )
    
    # Account filter
    account_filter = st.sidebar.multiselect(
        "Account Type",
        options=['debit', 'credit'],
        default=['debit', 'credit']
    )
    
    # Category filter
    categories = df['Classification'].unique().tolist()
    category_filter = st.sidebar.multiselect(
        "Categories",
        options=categories,
        default=categories
    )
    
    # Apply filters
    filtered_df = df.copy()
    if len(date_range) == 2:
        filtered_df = filtered_df[
            (filtered_df['Post Date'].dt.date >= date_range[0]) &
            (filtered_df['Post Date'].dt.date <= date_range[1])
        ]
    if account_filter:
        filtered_df = filtered_df[filtered_df['Account Type'].isin(account_filter)]
    if category_filter:
        filtered_df = filtered_df[filtered_df['Classification'].isin(category_filter)]
    
    # Key Metrics Row
    st.subheader("📈 Key Metrics")
    
    # Calculate metrics (excluding transfers)
    filtered_no_transfers = filtered_df[~filtered_df['Is_Transfer']]
    total_income = filtered_no_transfers['Credit'].sum()
    total_expenses = filtered_no_transfers['Debit'].sum()
    net_cash_flow = total_income - total_expenses
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric(
            label="Total Income",
            value=f"${total_income:,.2f}",
            delta=None
        )
    
    with col2:
        st.metric(
            label="Total Expenses",
            value=f"${total_expenses:,.2f}",
            delta=None
        )
    
    with col3:
        st.metric(
            label="Net Cash Flow",
            value=f"${net_cash_flow:,.2f}",
            delta=None,
            delta_color="normal" if net_cash_flow >= 0 else "inverse"
        )
    
    with col4:
        savings_rate = (net_cash_flow / total_income * 100) if total_income > 0 else 0
        st.metric(
            label="Savings Rate",
            value=f"{savings_rate:.1f}%",
            delta=None
        )
    
    st.markdown("---")
    
    # Tab navigation
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "📊 Overview", 
        "📅 Monthly Trends", 
        "🏷️ Categories", 
        "🏪 Merchants",
        "📋 Transactions"
    ])
    
    with tab1:
        st.subheader("Financial Overview")
        
        col1, col2 = st.columns(2)
        
        with col1:
            # Account comparison
            st.markdown("#### Account Spending Breakdown")
            account_comparison = st.session_state.processor.get_account_comparison(filtered_df)
            
            fig_accounts = go.Figure(data=[
                go.Pie(
                    labels=['Debit Card', 'Credit Card'],
                    values=[account_comparison['debit_spending'], account_comparison['credit_spending']],
                    hole=0.4,
                    marker=dict(colors=['#FF6B6B', '#4ECDC4'])
                )
            ])
            fig_accounts.update_layout(
                showlegend=True,
                height=350,
                margin=dict(l=20, r=20, t=40, b=20)
            )
            st.plotly_chart(fig_accounts, use_container_width=True)
            
            st.markdown(f"**Credit Card Usage:** {account_comparison['credit_percentage']:.1f}%")
        
        with col2:
            # Top 5 categories
            st.markdown("#### Top 5 Spending Categories")
            category_data = st.session_state.processor.get_category_breakdown(filtered_df)
            top_5_categories = category_data.head(5)
            
            fig_top_categories = px.bar(
                top_5_categories,
                x='Total_Spent',
                y='Category',
                orientation='h',
                text='Total_Spent',
                color='Total_Spent',
                color_continuous_scale='Blues'
            )
            fig_top_categories.update_traces(
                texttemplate='$%{text:.2f}',
                textposition='outside'
            )
            fig_top_categories.update_layout(
                showlegend=False,
                height=350,
                margin=dict(l=20, r=20, t=40, b=20),
                xaxis_title="Amount Spent ($)",
                yaxis_title=""
            )
            fig_top_categories.update_yaxes(categoryorder='total ascending')
            st.plotly_chart(fig_top_categories, use_container_width=True)
        
        # Monthly cash flow chart
        st.markdown("#### Monthly Cash Flow")
        monthly_data = st.session_state.processor.get_monthly_summary(filtered_df)
        
        fig_monthly = go.Figure()
        fig_monthly.add_trace(go.Bar(
            x=monthly_data['Month'],
            y=monthly_data['Total_Income'],
            name='Income',
            marker_color='#4ECDC4'
        ))
        fig_monthly.add_trace(go.Bar(
            x=monthly_data['Month'],
            y=monthly_data['Total_Expenses'],
            name='Expenses',
            marker_color='#FF6B6B'
        ))
        fig_monthly.add_trace(go.Scatter(
            x=monthly_data['Month'],
            y=monthly_data['Net_Cash_Flow'],
            name='Net Cash Flow',
            mode='lines+markers',
            line=dict(color='#95E1D3', width=3),
            marker=dict(size=8)
        ))
        fig_monthly.update_layout(
            barmode='group',
            height=400,
            xaxis_title="Month",
            yaxis_title="Amount ($)",
            hovermode='x unified',
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
        )
        st.plotly_chart(fig_monthly, use_container_width=True)
    
    with tab2:
        st.subheader("Monthly Trends")
        
        monthly_data = st.session_state.processor.get_monthly_summary(filtered_df)
        
        # Month selector
        selected_month = st.selectbox(
            "Select Month for Detailed View",
            options=monthly_data['Month'].tolist(),
            index=len(monthly_data) - 1  # Default to most recent
        )
        
        if selected_month:
            month_info = monthly_data[monthly_data['Month'] == selected_month].iloc[0]
            
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Income", f"${month_info['Total_Income']:,.2f}")
            with col2:
                st.metric("Expenses", f"${month_info['Total_Expenses']:,.2f}")
            with col3:
                st.metric("Net", f"${month_info['Net_Cash_Flow']:,.2f}")
            
            # Category breakdown for selected month
            st.markdown("#### Category Breakdown")
            month_categories = st.session_state.processor.get_category_breakdown(filtered_df, selected_month)
            
            col1, col2 = st.columns([2, 1])
            
            with col1:
                fig_cat_pie = px.pie(
                    month_categories,
                    values='Total_Spent',
                    names='Category',
                    title=f"Spending by Category - {selected_month}"
                )
                fig_cat_pie.update_traces(textposition='inside', textinfo='percent+label')
                fig_cat_pie.update_layout(height=500)
                st.plotly_chart(fig_cat_pie, use_container_width=True)
            
            with col2:
                st.markdown("#### Category Details")
                for _, row in month_categories.iterrows():
                    percentage = (row['Total_Spent'] / row['Total_Spent'].sum() * 100) if month_categories['Total_Spent'].sum() > 0 else 0
                    st.markdown(f"**{row['Category']}**")
                    st.markdown(f"${row['Total_Spent']:,.2f} ({row['Transaction_Count']} transactions)")
                    st.progress(percentage / 100)
                    st.markdown("---")
    
    with tab3:
        st.subheader("Category Analysis")
        
        category_data = st.session_state.processor.get_category_breakdown(filtered_df)
        
        col1, col2 = st.columns([3, 2])
        
        with col1:
            # Treemap of categories
            fig_treemap = px.treemap(
                category_data,
                path=['Category'],
                values='Total_Spent',
                title="Spending Distribution by Category",
                color='Total_Spent',
                color_continuous_scale='RdYlGn_r'
            )
            fig_treemap.update_layout(height=500)
            st.plotly_chart(fig_treemap, use_container_width=True)
        
        with col2:
            st.markdown("#### Category Summary")
            st.dataframe(
                category_data.style.format({
                    'Total_Spent': '${:,.2f}',
                    'Transaction_Count': '{:.0f}'
                }),
                use_container_width=True,
                height=500
            )
    
    with tab4:
        st.subheader("Top Merchants")
        
        top_n = st.slider("Number of merchants to display", 5, 20, 10)
        merchant_data = st.session_state.processor.get_transactions_by_merchant(filtered_df, top_n)
        
        col1, col2 = st.columns([2, 1])
        
        with col1:
            fig_merchants = px.bar(
                merchant_data,
                x='Total_Spent',
                y='Merchant',
                orientation='h',
                text='Total_Spent',
                color='Avg_Transaction',
                color_continuous_scale='Viridis',
                title=f"Top {top_n} Merchants by Total Spending"
            )
            fig_merchants.update_traces(
                texttemplate='$%{text:.2f}',
                textposition='outside'
            )
            fig_merchants.update_layout(
                height=600,
                xaxis_title="Total Spent ($)",
                yaxis_title=""
            )
            fig_merchants.update_yaxes(categoryorder='total ascending')
            st.plotly_chart(fig_merchants, use_container_width=True)
        
        with col2:
            st.markdown("#### Merchant Details")
            st.dataframe(
                merchant_data.style.format({
                    'Total_Spent': '${:,.2f}',
                    'Visit_Count': '{:.0f}',
                    'Avg_Transaction': '${:,.2f}'
                }),
                use_container_width=True,
                height=600
            )
    
    with tab5:
        st.subheader("Transaction History")
        
        # Transaction filters
        col1, col2, col3 = st.columns(3)
        
        with col1:
            show_transfers = st.checkbox("Show Transfers", value=False)
        with col2:
            transaction_type = st.selectbox(
                "Transaction Type",
                ["All", "Expenses Only", "Income Only"]
            )
        with col3:
            sort_by = st.selectbox(
                "Sort By",
                ["Date (Recent First)", "Date (Oldest First)", "Amount (High to Low)", "Amount (Low to High)"]
            )
        
        # Filter transactions
        display_df = filtered_df.copy()
        
        if not show_transfers:
            display_df = display_df[~display_df['Is_Transfer']]
        
        if transaction_type == "Expenses Only":
            display_df = display_df[display_df['Debit'] > 0]
        elif transaction_type == "Income Only":
            display_df = display_df[display_df['Credit'] > 0]
        
        # Sort
        if sort_by == "Date (Recent First)":
            display_df = display_df.sort_values('Post Date', ascending=False)
        elif sort_by == "Date (Oldest First)":
            display_df = display_df.sort_values('Post Date', ascending=True)
        elif sort_by == "Amount (High to Low)":
            display_df['Sort_Amount'] = display_df['Debit'] + display_df['Credit']
            display_df = display_df.sort_values('Sort_Amount', ascending=False)
        else:
            display_df['Sort_Amount'] = display_df['Debit'] + display_df['Credit']
            display_df = display_df.sort_values('Sort_Amount', ascending=True)
        
        # Display transaction count
        st.markdown(f"**Showing {len(display_df)} transactions**")
        
        # Format and display transactions
        display_columns = ['Post Date', 'Description', 'Classification', 'Debit', 'Credit', 'Balance', 'Account Type']
        
        st.dataframe(
            display_df[display_columns].style.format({
                'Post Date': lambda x: x.strftime('%Y-%m-%d'),
                'Debit': '${:,.2f}',
                'Credit': '${:,.2f}',
                'Balance': '${:,.2f}'
            }),
            use_container_width=True,
            height=600
        )
        
        # Download button
        csv = display_df[display_columns].to_csv(index=False)
        st.download_button(
            label="📥 Download Filtered Transactions (CSV)",
            data=csv,
            file_name=f"transactions_{datetime.now().strftime('%Y%m%d')}.csv",
            mime="text/csv"
        )

else:
    # Welcome screen
    st.markdown('<div class="main-header">💰 Personal Finance Dashboard</div>', unsafe_allow_html=True)
    st.markdown("---")
    
    st.markdown("""
    ### Welcome to Your Personal Finance Dashboard! 
    
    This tool helps you visualize and analyze your spending across your debit and credit accounts.
    
    #### 📋 Getting Started:
    
    1. **Export your bank data**: Download CSV files from your bank for both checking and credit accounts
    2. **Upload files**: Use the sidebar to upload your debit and credit account CSVs
    3. **Explore your finances**: View interactive charts, trends, and insights
    
    #### ✨ Features:
    
    - **Overview Dashboard**: See your total income, expenses, and cash flow at a glance
    - **Monthly Trends**: Track how your spending changes over time
    - **Category Analysis**: Understand where your money goes
    - **Merchant Insights**: Identify your most frequent purchases
    - **Transaction History**: Search and filter all your transactions
    - **Smart Transfer Detection**: Automatically identifies credit card payments to avoid double-counting
    
    #### 📊 What You'll See:
    
    - Interactive charts and visualizations
    - Spending breakdowns by category and merchant
    - Month-over-month comparisons
    - Savings rate calculations
    - Account usage patterns
    
    **👈 Upload your CSV files in the sidebar to begin!**
    """)
    
    # Show expected CSV format
    with st.expander("📄 Expected CSV Format"):
        st.markdown("""
        Your bank CSVs should have these columns:
        
        - **Account Number**: Account identifier
        - **Post Date**: Transaction date
        - **Check**: Check number (can be empty)
        - **Description**: Merchant/transaction description
        - **Debit**: Money spent (outgoing)
        - **Credit**: Money received (incoming)
        - **Status**: Transaction status (Posted, Pending, etc.)
        - **Balance**: Account balance after transaction
        - **Classification**: Category (Groceries, Shopping, etc.)
        """)
        
        st.markdown("**Example:**")
        example_df = pd.DataFrame({
            'Account Number': ['S09', 'S09'],
            'Post Date': ['1/31/2026', '1/28/2026'],
            'Check': ['', ''],
            'Description': ['Trader Joe\'s', 'CVS'],
            'Debit': [52.66, 25.34],
            'Credit': ['', ''],
            'Status': ['Posted', 'Posted'],
            'Balance': [47399.19, 41347.97],
            'Classification': ['Groceries', 'Pharmacy']
        })
        st.dataframe(example_df, use_container_width=True)

# Footer
st.sidebar.markdown("---")
st.sidebar.markdown("### 💡 Tips")
st.sidebar.info("""
- Upload fresh CSVs monthly for up-to-date insights
- Use filters to focus on specific time periods or categories
- Download filtered transaction data for further analysis
""")
