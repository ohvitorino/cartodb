# encoding: utf-8
require_relative '../../acceptance_helper'

feature "Superadmin's users API" do
  background do
    Capybara.current_driver = :rack_test
    User.any_instance.stubs(:load_cartodb_functions).returns(true)
    User.any_instance.stubs(:set_database_permissions).returns(true)
    User.any_instance.stubs(:create_schemas_and_set_permissions).returns(true)
    User.any_instance.stubs(:remaining_quota).returns(10)
    @new_user = new_user(:password => "this_is_a_password")
    @user_atts = @new_user.values
  end

  scenario "Http auth is needed" do
    post_json superadmin_users_path, { :format => "json" } do |response|
      response.status.should == 401
    end
  end

  scenario "user create fail" do
    @user_atts[:email] = nil

    post_json superadmin_users_path, { :user => @user_atts }, default_headers do |response|
      response.status.should == 422
      response.body[:errors]['email'].should be_present
      response.body[:errors]['email'].should include("is not present")
    end
  end

  scenario "user create with password success" do
    @user_atts.delete(:crypted_password)
    @user_atts.delete(:salt)
    @user_atts.merge!(:password => "this_is_a_password")

    post_json superadmin_users_path, { :user => @user_atts }, default_headers do |response|
      response.status.should == 201
      response.body[:email].should == @user_atts[:email]
      response.body[:username].should == @user_atts[:username]
      response.body.should_not have_key(:crypted_password)
      response.body.should_not have_key(:salt)

      # Double check that the user has been created properly
      user = User.filter(:email => @user_atts[:email]).first
      user.should be_present
      user.id.should == response.body[:id]
      User.authenticate(user.username, "this_is_a_password").should == user
    end
  end

  scenario "user create with crypted_password and salt success" do
    post_json superadmin_users_path, { :user => @user_atts }, default_headers do |response|
      response.status.should == 201
      response.body[:email].should == @user_atts[:email]
      response.body[:username].should == @user_atts[:username]
      response.body.should_not have_key(:crypted_password)
      response.body.should_not have_key(:salt)

      # Double check that the user has been created properly
      user = User.filter(:email => @user_atts[:email]).first
      user.should be_present
      user.id.should == response.body[:id]
      User.authenticate(user.username, "this_is_a_password").should == user
    end
  end

  scenario "user create default account settings" do
    @user_atts[:private_tables_enabled] = false
    @user_atts[:sync_tables_enabled] = false
    @user_atts[:map_view_quota] = 80
    t = Time.now
    @user_atts[:upgraded_at] = t
    post_json superadmin_users_path, { :user => @user_atts }, default_headers do |response|
      response.status.should == 201
      response.body[:quota_in_bytes].should == 104857600
      response.body[:table_quota].should == 5
      response.body[:account_type].should == 'FREE'
      response.body[:private_tables_enabled].should == false
      response.body[:sync_tables_enabled].should == false
      response.body[:map_view_quota].should == 80

      # Double check that the user has been created properly
      user = User.filter(:email => @user_atts[:email]).first
      user.quota_in_bytes.should == 104857600
      user.table_quota.should == 5
      user.account_type.should == 'FREE'
      user.private_tables_enabled.should == false
      user.upgraded_at.should.to_s == t.to_s
    end
  end


  scenario "user create non-default account settings" do
    @user_atts[:quota_in_bytes] = 2000
    @user_atts[:table_quota]    = 20
    @user_atts[:account_type]   = 'Juliet'
    @user_atts[:private_tables_enabled] = true
    @user_atts[:sync_tables_enabled] = true
    @user_atts[:map_view_block_price] = 15
    @user_atts[:geocoding_quota] = 15
    @user_atts[:geocoding_block_price] = 2
    @user_atts[:notification] = 'Test'

    post_json superadmin_users_path, { :user => @user_atts }, default_headers do |response|
      response.status.should == 201
      response.body[:quota_in_bytes].should == 2000
      response.body[:table_quota].should == 20
      response.body[:account_type].should == 'Juliet'
      response.body[:private_tables_enabled].should == true
      response.body[:sync_tables_enabled].should == true
      response.body[:sync_tables_enabled].should == true
      response.body[:map_view_block_price].should == 15
      response.body[:geocoding_quota].should == 15
      response.body[:geocoding_block_price].should == 2
      response.body[:notification].should == 'Test'

      # Double check that the user has been created properly
      user = User.filter(:email => @user_atts[:email]).first
      user.quota_in_bytes.should == 2000
      user.table_quota.should == 20
      user.account_type.should == 'Juliet'
      user.private_tables_enabled.should == true
      user.sync_tables_enabled.should == true
      user.map_view_block_price.should == 15
      user.geocoding_quota.should == 15
      user.geocoding_block_price.should == 2
      user.notification.should == 'Test'
    end
  end


  scenario "update user account details" do
    user = create_user
    t = Time.now
    @update_atts = {:quota_in_bytes   => 2000,
                    :table_quota      => 20,
                    :max_layers       => 10,
                    :user_timeout     => 100000,
                    :database_timeout => 200000,
                    :account_type     => 'Juliet',
                    :private_tables_enabled => true,
                    :sync_tables_enabled => true,
                    :upgraded_at      => t,
                    :map_view_block_price => 200,
                    :geocoding_quota => 230,
                    :geocoding_block_price => 5,
                    :notification => 'Test',
                    :disqus_shortname => 'abc' }

    # test to true
    put_json superadmin_user_path(user), { :user => @update_atts }, default_headers do |response|
      response.status.should == 204
    end
    user = User[user.id]
    user.quota_in_bytes.should == 2000
    user.table_quota.should == 20
    user.account_type.should == 'Juliet'
    user.private_tables_enabled.should == true
    user.sync_tables_enabled.should == true
    user.max_layers.should == 10
    user.database_timeout.should == 200000
    user.user_timeout.should == 100000
    user.upgraded_at.to_s.should == t.to_s
    user.map_view_block_price.should == 200
    user.geocoding_quota.should == 230
    user.geocoding_block_price.should == 5
    user.notification.should == 'Test'
    user.disqus_shortname.should == 'abc'

    # then test back to false
    put_json superadmin_user_path(user), { :user => {:private_tables_enabled => false} }, default_headers do |response|
      response.status.should == 204
    end
    user = User[user.id]
    user.private_tables_enabled.should == false
    user.map_view_block_price.should == 200
    user.geocoding_quota.should == 230
    user.geocoding_block_price.should == 5
    user.notification.should == 'Test'
  end

  scenario "user update fail" do
    user = create_user

    put_json superadmin_user_path(user), { :user => { :email => "" } }, default_headers do |response|
      response.status.should == 422
    end
  end

  scenario "user update success" do
    user = create_user
    put_json superadmin_user_path(user), { :user => { :email => "newmail@test.com", :map_view_quota => 80 } }, default_headers do |response|
      response.status.should == 204
    end
    user = User[user.id]
    user.email.should == "newmail@test.com"
    user.map_view_quota.should == 80
  end

  scenario "update success with new organization" do
    user = create_user
    @update_atts = { 
      quota_in_bytes: 2000, 
      organization_attributes: { name: 'wadus', seats: 25, quota_in_bytes: 40000 }
    }

    put_json superadmin_user_path(user), { user: @update_atts }, default_headers do |response|
      response.status.should eq 204
    end
    user = User[user.id]
    user.quota_in_bytes.should eq 2000
    user.organization.name.should eq 'wadus'
    user.organization.seats.should eq 25
    user.organization.quota_in_bytes.should eq 40000

    @update_atts = { 
      quota_in_bytes: 2001, 
      organization_attributes: { name: 'wadus', seats: 26 }
    }
    put_json superadmin_user_path(user), { user: @update_atts }, default_headers do |response|
      response.status.should eq 204
    end
    user = User[user.id]
    user.quota_in_bytes.should eq 2001
    user.organization.name.should eq 'wadus'
    user.organization.seats.should eq 26
    user.organization.quota_in_bytes.should eq 40000
  end

  scenario "user delete success" do
    user = create_user
    delete_json superadmin_user_path(user), default_headers do |response|
      response.status.should == 204
    end
    User[user.id].should be_nil
  end

  scenario "user get info success" do
    user = create_user
    get_json superadmin_user_path(user), {}, default_headers do |response|
      response.status.should == 200
      response.body[:id].should == user.id
    end
  end

  describe "GET /superadmin/users" do
    before do
      @user  = create_user
      @user2 = create_user
    end

    it "gets all users" do
      get_json superadmin_users_path, {}, default_headers do |response|
        response.status.should == 200
        response.body.map { |u| u["username"] }.should include(@user.username, @user2.username)
        response.body.length.should >= 2
      end
    end

    it "gets overquota users" do
      User.stubs(:overquota).returns [@user]
      get_json superadmin_users_path, { overquota: true }, default_headers do |response|
        response.status.should == 200
        response.body[0]["username"].should == @user.username
        response.body.length.should == 1
      end
    end
  end

  private

  def default_headers(user = Cartodb.config[:superadmin]["username"], password = Cartodb.config[:superadmin]["password"])
    {
      'HTTP_AUTHORIZATION' => ActionController::HttpAuthentication::Basic.encode_credentials(user, password),
      'HTTP_ACCEPT' => "application/json"
    }
  end
end
