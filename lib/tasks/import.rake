# encoding: utf-8
require 'fileutils'
namespace :cartodb do
  desc 'Import a file to CartoDB'
  task :import, [:username, :filepath] => [:environment] do |task, args|
    user        = User.where(username: args[:username]).first
    filepath    = File.expand_path(args[:filepath])
    
    data_import = DataImport.create(
      :user_id       => user.id,
      :data_source   => filepath,
      :updated_at    => Time.now,
      :append        => false
    )
    data_import.values[:data_source] = filepath

    data_import.run_import!
    puts data_import.log
  end

  desc 'Import a table from a remote PostGIS database to CartoDB'
  task :import_table, [:host, :port, :user, :passwd, :db_name, :table_name, :CDB_username] => :environment do |tasks, args|

    user_cdb      = User.where(username: args[:CDB_username]).first

    host          = args[:host]
    port          = args[:port]
    user          = args[:user]
    passwd        = args[:passwd]
    db_name       = args[:db_name]
    table_name    = args[:table_name]

    start       = Time.now.strftime('%Y%m%d%H%M%S')
    dir         = '/tmp/table_importer'
    destination = "#{dir}/#{db_name}_#{table_name}_#{start}.json"


    if !File.directory? dir
      Dir.mkdir dir
    end

    puts "Creating file #{destination}"

    #cmd = "psql -h #{host} -p #{port} -U #{user} -d #{db_name} -c \"\\copy #{table_name} TO '#{destination}' DELIMITER ',' CSV HEADER QUOTE '|';\" > #{destination}"
    cmd = "ogr2ogr -f GeoJSON #{destination} \"PG:host=#{host} dbname=#{db_name} user=#{user} password=#{passwd}\" -sql \"select * from #{table_name}\""

    # Perform the system call
    puts cmd
    `#{cmd}`

    file_size = (File.size(destination).to_f / 2**20).round(2)

    puts "File size: #{file_size} MB"

    # Import file

    data_import = DataImport.create(
        :user_id       => user_cdb.id,
        :data_source   => destination,
        :updated_at    => Time.now,
        :append        => false
    )

    data_import.values[:data_source] = destination

    data_import.run_import!

    puts data_import.log

  end
end

